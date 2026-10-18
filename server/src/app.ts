import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { answerMcp, privateKey, type McpData } from './mcp-host.ts';
import { groupPage } from './page.ts';
import { makeVault } from './vault.ts';

type Row = Record<string, any>;
type User = { id: string; name: string; phone: string };

class Fail extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function fail(status: number, message: string): never {
  throw new Fail(status, message);
}

const ID = /^[A-Za-z0-9_-]{4,64}$/;
const RAILS = new Set(['upi', 'debit', 'credit', 'neft', 'imps', 'cash']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function text(v: unknown, max: number, field: string) {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(400, `${field} is invalid`);
  return v.trim();
}

function optText(v: unknown, max: number, field: string) {
  return v == null || v === '' ? null : text(v, max, field);
}

function ident(v: unknown, field: string) {
  if (typeof v !== 'string' || !ID.test(v)) fail(400, `${field} is invalid`);
  return v;
}

function money(v: unknown, field: string, allowZero = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (!allowZero && v === 0) || v >= 1e9) fail(400, `${field} is invalid`);
  return Math.round(v * 100) / 100;
}

function when(v: unknown) {
  if (typeof v !== 'string' || v.length > 40 || Number.isNaN(Date.parse(v))) fail(400, 'date is invalid');
  return v;
}

function obj(v: unknown, field: string): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, `${field} is invalid`);
  return v as Row;
}

function phoneOf(v: unknown) {
  const digits = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  if (digits.length < 8 || digits.length > 15) fail(400, 'Enter a valid phone number');
  return digits;
}

function hashPass(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

function checkPass(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const want = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(pw, Buffer.from(salt, 'hex'), want.length), want);
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const newId = () => randomBytes(9).toString('base64url');

async function readBody(req: IncomingMessage, max = 1_000_000): Promise<Row> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) fail(413, 'Body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'Body is not JSON');
  }
  return obj(parsed, 'body');
}

// A stolen token stops working after this long. People sign in again.
const SESSION_MS = 90 * 24 * 3600 * 1000;

const OTP_MS = 10 * 60 * 1000;

export function createApp(db: DatabaseSync, opts: {
  cors: string;
  key?: Buffer;
  everyonePro?: boolean;
  otpUrl?: string;
  sendOtp?: (phone: string, code: string) => void | Promise<void>;
  verifyPlay?: (purchaseToken: string, productId: string) => Promise<{ expiry: number }>;
  complete?: (history: { role: string; parts: Record<string, unknown>[] }[]) => Promise<{ role?: string; parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] }>;
}) {
  // Tests pass no key and get a throwaway one. The real server always passes one (see index.ts).
  const vault = makeVault(opts.key ?? randomBytes(32));
  const one = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).all(...args) as Row[];
  const run = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).run(...args);

  // ponytail: in-memory lockout, resets on restart and is per process. Move to the DB if you run several instances.
  const fails = new Map<string, { n: number; until: number }>();
  const views = new Map<string, { n: number; until: number }>();

  const memberOf = (groupId: string, personId: string) =>
    !!one('select 1 from members where group_id = ? and person_id = ?', groupId, personId);

  const needMember = (groupId: string, uid: string) => {
    if (!one('select 1 from groups where id = ?', groupId)) fail(404, 'Group not found');
    if (!memberOf(groupId, uid)) fail(403, 'You are not in this group');
  };

  // Seal anything saved before sealing existed.
  for (const table of ['expenses', 'settlements']) {
    for (const r of all(`select id, data from ${table}`)) {
      if (!vault.isSealed(r.data)) run(`update ${table} set data = ? where id = ?`, vault.seal(r.data), r.id);
    }
  }

  // The paywall lives here, never in the app. A self-hosted server makes everyone pro; the hosted one turns that off.
  // ponytail: pro_until is set by hand for now; a store or payment webhook writes it when billing exists.
  const isPro = (uid: string) => !!opts.everyonePro || (one('select pro_until from users where id = ?', uid)?.pro_until ?? 0) > Date.now();

  const membersOf = (groupId: string) =>
    new Set(all('select person_id from members where group_id = ?', groupId).map((r) => r.person_id as string));

  const freshCode = () => {
    for (;;) {
      const code = [...randomBytes(6)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      if (!one('select 1 from groups where code = ?', code)) return code;
    }
  };

  const session = (user: User) => {
    const token = randomBytes(32).toString('base64url');
    run('delete from sessions where created < ?', Date.now() - SESSION_MS);
    run('insert into sessions (token, user_id, created) values (?, ?, ?)', sha(token), user.id, Date.now());
    return { token, you: user };
  };

  const tx = <T>(fn: () => T): T => {
    db.exec('begin');
    try {
      const out = fn();
      db.exec('commit');
      return out;
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  };

  function sameHash(a: string, b: string) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  function takeCode(phone: string, purpose: string, code: unknown) {
    const given = typeof code === 'string' ? code.trim() : '';
    const row = one('select code_hash, expires from otps where phone = ? and purpose = ?', phone, purpose);
    if (!row || row.expires < Date.now() || !sameHash(sha(given), row.code_hash)) fail(400, 'That code is wrong or expired');
    run('delete from otps where phone = ? and purpose = ?', phone, purpose);
  }

  async function sendCode(body: Row) {
    const phone = phoneOf(body.phone);
    const purpose = body.purpose === 'reset' ? 'reset' : body.purpose === 'signup' ? 'signup' : '';
    if (!purpose) fail(400, 'purpose is invalid');
    if (purpose === 'reset' && !one('select 1 from users where phone = ?', phone)) return { ok: true };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    run(
      'insert into otps (phone, purpose, code_hash, expires) values (?, ?, ?, ?) on conflict(phone, purpose) do update set code_hash = excluded.code_hash, expires = excluded.expires',
      phone, purpose, sha(code), Date.now() + OTP_MS,
    );
    if (opts.sendOtp) {
      await opts.sendOtp(phone, code);
      return { ok: true };
    }
    if (opts.otpUrl) {
      const res = await fetch(opts.otpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) fail(502, 'Could not send the code');
      return { ok: true };
    }
    if (opts.everyonePro) {
      console.log(`kakei. code for ${phone}: ${code}`);
      return { ok: true };
    }
    run('delete from otps where phone = ? and purpose = ?', phone, purpose);
    fail(503, 'Phone verification is not configured');
  }

  function signup(body: Row) {
    const name = text(body.name, 40, 'Name');
    const phone = phoneOf(body.phone);
    const pass = typeof body.password === 'string' ? body.password : '';
    if (pass.length < 6 || pass.length > 200) fail(400, 'Password needs at least 6 characters');
    if (one('select 1 from users where phone = ?', phone)) fail(409, 'That phone already has an account. Log in instead.');
    const user = { id: newId(), name, phone };
    return tx(() => {
      run('insert into users (id, name, phone, pass, created) values (?, ?, ?, ?, ?)', user.id, name, phone, hashPass(pass), Date.now());
      run('insert into people (id, name, user_id, created_by) values (?, ?, ?, ?)', user.id, name, user.id, user.id);
      return session(user);
    });
  }

  function login(body: Row) {
    const phone = phoneOf(body.phone);
    const lock = fails.get(phone);
    if (lock && lock.n >= 8 && lock.until > Date.now()) fail(429, 'Too many tries. Wait 15 minutes.');
    const row = one('select id, name, phone, pass from users where phone = ?', phone);
    const pass = typeof body.password === 'string' ? body.password : '';
    if (!row || !checkPass(pass, row.pass)) {
      const n = lock && lock.until > Date.now() ? lock.n + 1 : 1;
      fails.set(phone, { n, until: Date.now() + 15 * 60_000 });
      fail(401, 'Phone or password is wrong');
    }
    fails.delete(phone);
    return session({ id: row.id, name: row.name, phone: row.phone });
  }

  function resetPass(body: Row) {
    const phone = phoneOf(body.phone);
    const pass = typeof body.password === 'string' ? body.password : '';
    if (pass.length < 6 || pass.length > 200) fail(400, 'Password needs at least 6 characters');
    takeCode(phone, 'reset', body.otp);
    const row = one('select id from users where phone = ?', phone);
    if (!row) fail(400, 'That code is wrong or expired');
    run('update users set pass = ? where id = ?', hashPass(pass), row.id);
    run('delete from sessions where user_id = ?', row.id);
    return { ok: true };
  }

  function accountExport(user: User) {
    const snap = sync(user);
    const row = one('select created, pro_until from users where id = ?', user.id);
    const mine = 'select group_id from members where person_id = ?';
    return {
      account: { id: user.id, name: user.name, phone: user.phone, created: row?.created ?? null, proUntil: row?.pro_until ?? null },
      memberships: all(`select group_id, person_id from members where group_id in (${mine})`, user.id),
      backup: one('select wrap, blob, updated from backups where user_id = ?', user.id) ?? null,
      mcp: one('select public_id, enabled, updated from mcp_hosts where user_id = ?', user.id) ?? null,
      groups: snap.groups,
      people: snap.people,
      expenses: snap.expenses,
      settlements: snap.settlements,
    };
  }

  function deleteAccount(user: User, body: Row) {
    const pass = typeof body.password === 'string' ? body.password : '';
    const row = one('select pass from users where id = ?', user.id);
    if (!row || !checkPass(pass, row.pass)) fail(401, 'Password is wrong');
    tx(() => {
      for (const g of all('select id from groups where created_by = ?', user.id)) {
        const next = one(
          `select p.user_id as id from members m join people p on p.id = m.person_id
           where m.group_id = ? and p.user_id is not null and p.user_id != ? limit 1`,
          g.id, user.id,
        );
        if (next) run('update groups set created_by = ? where id = ?', next.id, g.id);
        else run('delete from groups where id = ?', g.id);
      }
      run('delete from expenses where owner_id = ? and group_id is null', user.id);
      run('delete from hidden where user_id = ?', user.id);
      run('delete from users where id = ?', user.id);
    });
    return { ok: true };
  }

  async function playPurchase(user: User, body: Row) {
    if (!opts.verifyPlay) fail(501, 'This server does not sell Pro');
    const purchaseToken = text(body.purchaseToken, 4096, 'purchaseToken');
    const productId = body.productId === 'kakei_pro_monthly' || body.productId === 'kakei_pro_yearly' ? body.productId : '';
    if (!productId) fail(400, 'productId is invalid');
    let expiry = 0;
    try {
      expiry = (await opts.verifyPlay(purchaseToken, productId)).expiry;
    } catch (err) {
      fail(400, err instanceof Error ? err.message : 'That purchase is not active');
    }
    if (expiry <= Date.now()) fail(400, 'That purchase is not active');
    const current = one('select pro_until from users where id = ?', user.id)?.pro_until ?? 0;
    const until = Math.max(Number(current) || 0, expiry);
    run('update users set pro_until = ? where id = ?', until, user.id);
    return { proUntil: until };
  }

  function saveBackup(user: User, body: Row) {
    if (!isPro(user.id)) fail(402, 'Pro is required');
    const wrap = text(body.wrap, 8_000_000, 'wrap');
    const blob = text(body.blob, 8_000_000, 'blob');
    run(
      'insert into backups (user_id, wrap, blob, updated) values (?, ?, ?, ?) on conflict(user_id) do update set wrap = excluded.wrap, blob = excluded.blob, updated = excluded.updated',
      user.id, wrap, blob, Date.now(),
    );
    return { ok: true };
  }

  function readBackup(user: User) {
    if (!isPro(user.id)) fail(402, 'Pro is required');
    const row = one('select wrap, blob, updated from backups where user_id = ?', user.id);
    if (!row) fail(404, 'No backup yet');
    return { wrap: row.wrap, blob: row.blob, updated: row.updated };
  }

  function readSettings(uid: string): Row {
    const row = one('select data from settings where user_id = ?', uid);
    if (!row) return {};
    try {
      return JSON.parse(vault.open(row.data)) as Row;
    } catch {
      return {};
    }
  }

  function writeSettings(uid: string, data: Row) {
    run(
      'insert into settings (user_id, data) values (?, ?) on conflict(user_id) do update set data = excluded.data',
      uid, vault.seal(JSON.stringify(data)),
    );
  }

  function mcpCreate(user: User, body: Row) {
    if (!isPro(user.id)) fail(402, 'Pro is required');
    if (body.confirm !== true) fail(400, 'Confirm to create a remote MCP');
    if (one('select 1 from mcp_hosts where user_id = ?', user.id)) fail(409, 'Remote MCP already exists');
    const token = randomBytes(32).toString('base64url');
    const publicId = randomBytes(9).toString('base64url');
    run(
      'insert into mcp_hosts (user_id, public_id, token_hash, enabled, snapshot, updated) values (?, ?, ?, 1, null, ?)',
      user.id, publicId, sha(token), Date.now(),
    );
    const settings = readSettings(user.id);
    settings.remoteMcp = { created: true, enabled: true, publicId };
    writeSettings(user.id, settings);
    return { token, publicId, url: `/m/${publicId}` };
  }

  function mcpSet(user: User, enabled: boolean) {
    const row = one('select public_id from mcp_hosts where user_id = ?', user.id);
    if (!row) fail(404, 'No remote MCP');
    run('update mcp_hosts set enabled = ?, updated = ? where user_id = ?', enabled ? 1 : 0, Date.now(), user.id);
    const settings = readSettings(user.id);
    settings.remoteMcp = { created: true, enabled, publicId: row.public_id };
    writeSettings(user.id, settings);
    return { ok: true };
  }

  function mcpRegenerate(user: User) {
    if (!isPro(user.id)) fail(402, 'Pro is required');
    const row = one('select public_id from mcp_hosts where user_id = ?', user.id);
    if (!row) fail(404, 'No remote MCP');
    const token = randomBytes(32).toString('base64url');
    run('update mcp_hosts set token_hash = ?, updated = ? where user_id = ?', sha(token), Date.now(), user.id);
    return { token, publicId: row.public_id, url: `/m/${row.public_id}` };
  }

  function mcpSnapshot(user: User, body: Row) {
    if (!isPro(user.id)) fail(402, 'Pro is required');
    const row = one('select enabled from mcp_hosts where user_id = ?', user.id);
    if (!row) fail(404, 'No remote MCP');
    if (!row.enabled) fail(403, 'Remote MCP is off');
    if (privateKey(body)) fail(400, 'That snapshot includes a private field');
    run('update mcp_hosts set snapshot = ?, updated = ? where user_id = ?', vault.seal(JSON.stringify(body)), Date.now(), user.id);
    return { ok: true };
  }

  async function mcpCall(publicId: string, req: IncomingMessage) {
    const row = one('select user_id, token_hash, enabled, snapshot from mcp_hosts where public_id = ?', publicId);
    if (!row) fail(404, 'Not found');
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !sameHash(sha(token), row.token_hash)) fail(401, 'Token is wrong');
    if (!row.enabled) fail(403, 'Remote MCP is off');
    if (!isPro(row.user_id)) fail(402, 'Pro is required');
    const owner = one('select name from users where id = ?', row.user_id);
    const data: McpData = row.snapshot
      ? JSON.parse(vault.open(row.snapshot))
      : { you: { id: row.user_id, name: owner?.name ?? 'You', initials: 'YO' }, people: [], groups: [], expenses: [], settlements: [], budget: 0 };
    const answered = answerMcp(JSON.stringify(await readBody(req, 1_000_000)), data);
    return { mcpStatus: answered.status, mcpBody: answered.body };
  }

  async function waitSync(user: User, after: number) {
    const mine = 'select group_id from members where person_id = ?';
    const deadline = Date.now() + 25_000;
    const newer = () => {
      const groups = one(`select max(updated) as n from groups where id in (${mine})`, user.id)?.n ?? 0;
      const expenses = one(`select max(updated) as n from expenses where group_id in (${mine})`, user.id)?.n ?? 0;
      const settlements = one(`select max(updated) as n from settlements where group_id in (${mine})`, user.id)?.n ?? 0;
      return Math.max(Number(groups) || 0, Number(expenses) || 0, Number(settlements) || 0) > after;
    };
    while (!newer()) {
      if (Date.now() >= deadline) return { changed: false };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return { changed: true };
  }

  function viewGroup(req: IncomingMessage, code: string) {
    const ip = req.socket.remoteAddress ?? 'local';
    const lock = views.get(ip);
    if (lock && lock.n >= 30 && lock.until > Date.now()) fail(429, 'Too many views');
    views.set(ip, { n: lock && lock.until > Date.now() ? lock.n + 1 : 1, until: Date.now() + 60_000 });
    const g = one('select id, name, note from groups where code = ?', code);
    if (!g) fail(404, 'Group not found');
    const people = all(
      `select p.id, p.name from people p join members m on m.person_id = p.id where m.group_id = ?`,
      g.id,
    );
    const names = new Map(people.map((p) => [p.id as string, p.name as string]));
    const rows = all('select data from expenses where group_id = ?', g.id).map((r) => {
      const e = JSON.parse(vault.open(r.data));
      return { name: names.get(e.payerId) ?? 'Someone', merchant: String(e.merchant ?? ''), amount: Number(e.amount) || 0 };
    });
    return { html: groupPage({ name: g.name, note: g.note }, rows) };
  }

  async function ask(user: User, body: Row) {
    if (body.consent !== true) fail(400, 'Ask needs a yes first');
    if (!isPro(user.id)) fail(402, 'Pro is required');
    const settings = readSettings(user.id);
    settings.ask = true;
    writeSettings(user.id, settings);
    if (!opts.complete) fail(501, 'This server has no AI key');
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const toolResults = Array.isArray(body.toolResults) ? body.toolResults : null;
    if (!question && !toolResults) return { ok: true };
    const ym = new Date().toISOString().slice(0, 7);
    const used = one('select n from ai_usage where user_id = ? and ym = ?', user.id, ym)?.n ?? 0;
    if (used >= 30) fail(429, 'The monthly Ask limit is used up');
    run(
      'insert into ai_usage (user_id, ym, n) values (?, ?, ?) on conflict(user_id, ym) do update set n = n + 1',
      user.id, ym, Number(used) + 1,
    );
    const history = Array.isArray(body.history) ? body.history as { role: string; parts: Record<string, unknown>[] }[] : [];
    if (question) history.push({ role: 'user', parts: [{ text: question }] });
    if (toolResults) history.push({ role: 'user', parts: toolResults.map((item) => ({ functionResponse: item })) });
    let reply: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] };
    try {
      reply = await opts.complete(history);
    } catch (err) {
      fail(502, err instanceof Error ? err.message : 'The model did not answer');
    }
    const parts = reply.parts ?? [];
    return {
      history: [...history, { role: 'model', parts }],
      text: parts.map((part) => part.text).filter(Boolean).join('\n'),
      toolCalls: parts.filter((part) => part.functionCall).map((part) => ({ name: part.functionCall!.name, args: part.functionCall!.args ?? {} })),
    };
  }

  function auth(req: IncomingMessage): User {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const row = token
      ? one(
          'select u.id, u.name, u.phone from sessions s join users u on u.id = s.user_id where s.token = ? and s.created > ?',
          sha(token),
          Date.now() - SESSION_MS,
        )
      : undefined;
    if (!row) fail(401, 'Sign in again');
    return { id: row.id, name: row.name, phone: row.phone };
  }

  function sync(user: User) {
    const uid = user.id;
    const mine = 'select group_id from members where person_id = ?';
    const groups = all(`select * from groups where id in (${mine}) order by updated desc`, uid);
    const members = all(`select group_id, person_id from members where group_id in (${mine})`, uid);
    const people = all(
      `select distinct p.id, p.name, p.user_id from people p join members m on m.person_id = p.id
       where m.group_id in (${mine}) and p.id != ?`,
      uid, uid,
    );
    const hidden = new Set(all('select expense_id from hidden where user_id = ?', uid).map((r) => r.expense_id as string));
    const expenses = all(
      // Only group expenses. A personal expense never needs to be here, so old ones are not sent back.
      `select data from expenses where group_id in (${mine})`,
      uid,
    ).map((r) => {
      const e = JSON.parse(vault.open(r.data));
      return { ...e, reflect: !hidden.has(e.id) };
    });
    const settlements = all(`select data from settlements where group_id in (${mine})`, uid).map((r) => JSON.parse(vault.open(r.data)));
    return {
      you: user,
      pro: isPro(uid),
      people: people.map((p) => ({ id: p.id, name: p.name, claimed: !!p.user_id })),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        note: g.note,
        kind: g.kind === 'split' ? 'split' : 'group',
        code: g.code,
        sample: !!g.sample,
        simplify: g.simplify !== 0,
        owner: g.created_by === uid,
        memberIds: members.filter((m) => m.group_id === g.id && m.person_id !== uid).map((m) => m.person_id),
      })),
      expenses,
      settlements,
      // Budget, tags and history stay on the phone. Kept as an empty object so older apps still read the reply.
      prefs: {},
      settings: readSettings(uid),
    };
  }

  function canTouchExpense(row: Row, uid: string) {
    if (row.group_id) needMember(row.group_id, uid);
    else if (row.owner_id !== uid) fail(403, 'Not your expense');
  }

  function applyOp(user: User, op: Row) {
    const uid = user.id;
    switch (op.type) {
      case 'group.upsert': {
        const g = obj(op.group, 'group');
        const id = ident(g.id, 'group id');
        const name = text(g.name, 60, 'Group name');
        const icon = text(g.icon ?? 'account-group', 40, 'icon');
        const note = typeof g.note === 'string' ? g.note.slice(0, 80) : '';
        const simplify = g.simplify === false ? 0 : 1;
        // A split is one bill shared between a few people. It is made once and never turned into a full group.
        const kind = g.kind === 'split' ? 'split' : 'group';
        if (one('select 1 from groups where id = ?', id)) {
          needMember(id, uid);
          run('update groups set name = ?, icon = ?, note = ?, simplify = ?, updated = ? where id = ?', name, icon, note, simplify, Date.now(), id);
        } else {
          run(
            'insert into groups (id, name, icon, note, kind, code, created_by, sample, simplify, updated) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id, name, icon, note, kind, freshCode(), uid, g.sample ? 1 : 0, simplify, Date.now(),
          );
          run('insert into members (group_id, person_id) values (?, ?)', id, uid);
        }
        return;
      }
      case 'group.delete': {
        const id = ident(op.id, 'group id');
        const g = one('select created_by from groups where id = ?', id);
        if (!g) return;
        if (g.created_by !== uid) fail(403, 'Only the person who made the group can delete it');
        run('delete from groups where id = ?', id);
        run('delete from people where user_id is null and id not in (select person_id from members)');
        return;
      }
      case 'person.add': {
        const groupId = ident(op.groupId, 'group id');
        needMember(groupId, uid);
        const p = obj(op.person, 'person');
        const id = ident(p.id, 'person id');
        const name = text(p.name, 40, 'Name');
        if (memberOf(groupId, id)) return;
        if (one('select 1 from people where id = ?', id)) {
          const known = one(
            `select 1 from people p where p.id = ? and (p.created_by = ? or p.user_id = ? or exists (
               select 1 from members a join members b on a.group_id = b.group_id where a.person_id = p.id and b.person_id = ?))`,
            id, uid, uid, uid,
          );
          if (!known) fail(409, 'That person id is taken');
        } else {
          run('insert into people (id, name, user_id, created_by) values (?, ?, null, ?)', id, name, uid);
        }
        run('insert into members (group_id, person_id) values (?, ?)', groupId, id);
        return;
      }
      case 'expense.upsert': {
        const e = obj(op.expense, 'expense');
        const id = ident(e.id, 'expense id');
        // Only shared expenses live here. A personal one stays on its owner's phone, so it is ignored, not stored.
        if (e.groupId == null) return;
        const existing = one('select owner_id, group_id from expenses where id = ?', id);
        if (existing) canTouchExpense(existing, uid);
        const amount = money(e.amount, 'Amount');
        const groupId = e.groupId == null ? null : ident(e.groupId, 'group id');
        let payerId: string | null = null;
        let shares: Record<string, number> | null = null;
        if (groupId) {
          needMember(groupId, uid);
          const members = membersOf(groupId);
          payerId = ident(e.payerId, 'payer');
          if (!members.has(payerId)) fail(400, 'Payer is not in the group');
          shares = {};
          let sum = 0;
          for (const [pid, v] of Object.entries(obj(e.shares, 'shares'))) {
            if (!members.has(pid)) fail(400, 'Split includes someone outside the group');
            const share = money(v, 'Share', true);
            if (share > 0) shares[pid] = share;
            sum += share;
          }
          if (!Object.keys(shares).length || Math.abs(sum - amount) > 1) fail(400, 'Split does not add up to the amount');
          if (Array.isArray(e.payers) && e.payers.length) {
            let paid = 0;
            const payers: { id: string; amount: number }[] = [];
            for (const p of e.payers) {
              const row = obj(p, 'payer');
              const pid = ident(row.id, 'payer');
              if (!members.has(pid)) fail(400, 'Payer is not in the group');
              const part = money(row.amount, 'Paid', true);
              if (part > 0) payers.push({ id: pid, amount: part });
              paid += part;
            }
            if (!payers.length || Math.abs(paid - amount) > 1) fail(400, 'Payments do not add up to the amount');
            payerId = payers.slice().sort((a, b) => b.amount - a.amount)[0].id;
            e.payers = payers;
          }
          if (Array.isArray(e.items) && e.items.length) {
            let itemSum = 0;
            const items: { name: string; amount: number; memberIds: string[] }[] = [];
            for (const raw of e.items) {
              const item = obj(raw, 'item');
              const memberIds = Array.isArray(item.memberIds) ? item.memberIds.map((pid) => ident(pid, 'item member')) : [];
              if (memberIds.some((pid) => !members.has(pid))) fail(400, 'Item includes someone outside the group');
              const part = money(item.amount, 'Item');
              items.push({ name: text(item.name, 40, 'Item'), amount: part, memberIds });
              itemSum += part;
            }
            if (Math.abs(itemSum - amount) > 1) fail(400, 'Items do not add up to the amount');
            e.items = items;
          }
        }
        if (!RAILS.has(e.rail)) fail(400, 'rail is invalid');
        const data = {
          id,
          merchant: text(e.merchant, 80, 'Description'),
          amount,
          at: when(e.at),
          tag: optText(e.tag, 24, 'Tag'),
          rail: e.rail,
          income: !!e.income,
          transfer: !!e.transfer,
          recurring: e.recurring === 'weekly' || e.recurring === 'monthly' ? e.recurring : null,
          recurId: optText(e.recurId, 64, 'recurId'),
          groupId,
          payerId,
          shares,
          payers: Array.isArray(e.payers) ? e.payers : null,
          items: Array.isArray(e.items) ? e.items : null,
          // Which of your accounts paid is your business, not the group's.
          account: null,
          bank: null,
          note: typeof e.note === 'string' ? e.note.slice(0, 200) : '',
          sample: !!e.sample,
        };
        run(
          `insert into expenses (id, owner_id, group_id, data, updated) values (?, ?, ?, ?, ?)
           on conflict(id) do update set group_id = excluded.group_id, data = excluded.data, updated = excluded.updated`,
          id, existing?.owner_id ?? uid, groupId, vault.seal(JSON.stringify(data)), Date.now(),
        );
        if (e.reflect === false) run('insert or ignore into hidden (user_id, expense_id) values (?, ?)', uid, id);
        else run('delete from hidden where user_id = ? and expense_id = ?', uid, id);
        return;
      }
      case 'expense.delete': {
        const id = ident(op.id, 'expense id');
        const existing = one('select owner_id, group_id from expenses where id = ?', id);
        if (!existing) return;
        canTouchExpense(existing, uid);
        run('delete from expenses where id = ?', id);
        return;
      }
      case 'settlement.upsert': {
        const s = obj(op.settlement, 'settlement');
        const id = ident(s.id, 'settlement id');
        const groupId = ident(s.groupId, 'group id');
        needMember(groupId, uid);
        const existing = one('select group_id from settlements where id = ?', id);
        if (existing && existing.group_id !== groupId) fail(400, 'Settlement belongs to another group');
        const members = membersOf(groupId);
        const fromId = ident(s.fromId, 'from');
        const toId = ident(s.toId, 'to');
        if (!members.has(fromId) || !members.has(toId) || fromId === toId) fail(400, 'Settlement people are invalid');
        const data = {
          id, groupId, fromId, toId,
          amount: money(s.amount, 'Amount'),
          at: when(s.at),
          sample: !!s.sample,
        };
        run(
          `insert into settlements (id, group_id, data, updated) values (?, ?, ?, ?)
           on conflict(id) do update set data = excluded.data, updated = excluded.updated`,
          id, groupId, vault.seal(JSON.stringify(data)), Date.now(),
        );
        return;
      }
      case 'settlement.delete': {
        const id = ident(op.id, 'settlement id');
        const existing = one('select group_id from settlements where id = ?', id);
        if (!existing) return;
        needMember(existing.group_id, uid);
        run('delete from settlements where id = ?', id);
        return;
      }
      case 'prefs.set':
        // Budget, tags and history are personal. Older apps still send them, and they are dropped here.
        return;
      case 'personal.purge':
        // The phone asks once, after it has its own copy, to clear what older versions uploaded.
        run('delete from expenses where group_id is null and owner_id = ?', uid);
        run('delete from prefs where user_id = ?', uid);
        return;
      case 'me.set': {
        if (op.name !== undefined) {
          const name = text(op.name, 40, 'Name');
          run('update users set name = ? where id = ?', name, uid);
          run('update people set name = ? where id = ?', name, uid);
        }
        return;
      }
      default:
        fail(400, `Unknown op ${String(op.type)}`);
    }
  }

  function ops(user: User, body: Row) {
    if (!Array.isArray(body.ops) || body.ops.length > 500) fail(400, 'ops are invalid');
    const list = body.ops as unknown[];
    return tx(() => ({
      results: list.map((op) => {
        db.exec('savepoint op');
        try {
          applyOp(user, obj(op, 'op'));
          db.exec('release op');
          return { ok: true };
        } catch (err) {
          db.exec('rollback to op');
          db.exec('release op');
          if (err instanceof Fail) return { ok: false, error: err.message };
          throw err;
        }
      }),
    }));
  }

  function groupByCode(raw: unknown) {
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    return one('select id, name, icon, note from groups where code = ?', code) ?? fail(404, 'No group with that code');
  }

  function invite(user: User, code: string) {
    const g = groupByCode(code);
    const people = all(
      'select p.id, p.name, p.user_id from people p join members m on m.person_id = p.id where m.group_id = ?',
      g.id,
    );
    return {
      group: { id: g.id, name: g.name, icon: g.icon, note: g.note },
      joined: memberOf(g.id, user.id),
      members: people.map((p) => ({ id: p.id, name: p.name, claimable: !p.user_id })),
    };
  }

  function join(user: User, body: Row) {
    const g = groupByCode(body.code);
    const uid = user.id;
    if (memberOf(g.id, uid)) return { groupId: g.id };
    const claimId = body.claimId == null ? null : ident(body.claimId, 'person');
    tx(() => {
      if (!claimId) {
        run('insert into members (group_id, person_id) values (?, ?)', g.id, uid);
        return;
      }
      const p = one('select user_id from people where id = ?', claimId);
      if (!p || p.user_id || !memberOf(g.id, claimId)) fail(400, 'That person was already claimed');
      const swap = (id: string) => (id === claimId ? uid : id);
      run('update members set person_id = ? where group_id = ? and person_id = ?', uid, g.id, claimId);
      for (const r of all('select id, data from expenses where group_id = ?', g.id)) {
        const e = JSON.parse(vault.open(r.data));
        e.payerId = e.payerId ? swap(e.payerId) : e.payerId;
        e.shares = Object.fromEntries(Object.entries(e.shares ?? {}).map(([k, v]) => [swap(k), v]));
        run('update expenses set data = ?, updated = ? where id = ?', vault.seal(JSON.stringify(e)), Date.now(), r.id);
      }
      for (const r of all('select id, data from settlements where group_id = ?', g.id)) {
        const s = JSON.parse(vault.open(r.data));
        s.fromId = swap(s.fromId);
        s.toId = swap(s.toId);
        run('update settlements set data = ?, updated = ? where id = ?', vault.seal(JSON.stringify(s)), Date.now(), r.id);
      }
      run('delete from people where id = ? and id not in (select person_id from members)', claimId);
    });
    return { groupId: g.id };
  }

  async function route(req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';
    if (method === 'GET' && path === '/health') return { ok: true };
    const view = path.match(/^\/view\/([A-Za-z0-9]{4,12})$/);
    if (method === 'GET' && view) return viewGroup(req, view[1]);
    const host = path.match(/^\/m\/([A-Za-z0-9_-]+)$/);
    if (method === 'POST' && host) return mcpCall(host[1], req);
    if (method === 'POST' && path === '/auth/otp') return sendCode(await readBody(req));
    if (method === 'POST' && path === '/auth/signup') return signup(await readBody(req));
    if (method === 'POST' && path === '/auth/login') return login(await readBody(req));
    if (method === 'POST' && path === '/auth/reset') return resetPass(await readBody(req));
    const user = auth(req);
    if (method === 'POST' && path === '/auth/logout') {
      run('delete from sessions where token = ?', sha((req.headers.authorization ?? '').slice(7)));
      return { ok: true };
    }
    if (method === 'POST' && path === '/billing/play') return playPurchase(user, await readBody(req));
    if (method === 'POST' && path === '/backup') return saveBackup(user, await readBody(req, 8_000_000));
    if (method === 'GET' && path === '/backup') return readBackup(user);
    if (method === 'POST' && path === '/mcp/create') return mcpCreate(user, await readBody(req));
    if (method === 'POST' && path === '/mcp/enable') return mcpSet(user, true);
    if (method === 'POST' && path === '/mcp/disable') return mcpSet(user, false);
    if (method === 'POST' && path === '/mcp/regenerate') return mcpRegenerate(user);
    if (method === 'POST' && path === '/mcp/snapshot') return mcpSnapshot(user, await readBody(req, 8_000_000));
    if (method === 'POST' && path === '/ai/ask') return ask(user, await readBody(req));
    if (method === 'GET' && path === '/account/export') return accountExport(user);
    if (method === 'POST' && path === '/account/delete') return deleteAccount(user, await readBody(req));
    if (method === 'GET' && path === '/sync/wait') return waitSync(user, Number(url.searchParams.get('after') ?? 0));
    if (method === 'GET' && path === '/sync') return sync(user);
    if (method === 'POST' && path === '/ops') return ops(user, await readBody(req));
    if (method === 'POST' && path === '/join') return join(user, await readBody(req));
    const inv = path.match(/^\/invite\/([A-Za-z0-9]{4,12})$/);
    if (method === 'GET' && inv) return invite(user, inv[1]);
    fail(404, 'Not found');
  }

  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', opts.cors);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    let status = 200;
    let out: unknown;
    try {
      out = await route(req);
    } catch (err) {
      if (err instanceof Fail) {
        status = err.status;
        out = { error: err.message };
      } else {
        console.error(err);
        status = 500;
        out = { error: 'Server error' };
      }
    }
    if (out && typeof out === 'object' && 'html' in out) {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end((out as { html: string }).html);
      return;
    }
    const mcp = out && typeof out === 'object' && 'mcpBody' in out ? out as { mcpStatus: number; mcpBody: string } : null;
    if (mcp) {
      res.writeHead(mcp.mcpStatus, { 'Content-Type': 'application/json' }).end(mcp.mcpBody);
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  });
}
