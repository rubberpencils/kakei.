import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

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

async function readBody(req: IncomingMessage): Promise<Row> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 1_000_000) fail(413, 'Body too large');
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

export function createApp(db: DatabaseSync, opts: { cors: string }) {
  const one = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).get(...args) as Row | undefined;
  const all = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).all(...args) as Row[];
  const run = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).run(...args);

  // ponytail: in-memory lockout, resets on restart and is per process. Move to the DB if you run several instances.
  const fails = new Map<string, { n: number; until: number }>();

  const memberOf = (groupId: string, personId: string) =>
    !!one('select 1 from members where group_id = ? and person_id = ?', groupId, personId);

  const needMember = (groupId: string, uid: string) => {
    if (!one('select 1 from groups where id = ?', groupId)) fail(404, 'Group not found');
    if (!memberOf(groupId, uid)) fail(403, 'You are not in this group');
  };

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

  function auth(req: IncomingMessage): User {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const row = token
      ? one('select u.id, u.name, u.phone from sessions s join users u on u.id = s.user_id where s.token = ?', sha(token))
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
      `select data from expenses where (group_id is null and owner_id = ?) or group_id in (${mine})`,
      uid, uid,
    ).map((r) => {
      const e = JSON.parse(r.data);
      return { ...e, reflect: !hidden.has(e.id) };
    });
    const settlements = all(`select data from settlements where group_id in (${mine})`, uid).map((r) => JSON.parse(r.data));
    const prefs = one('select data from prefs where user_id = ?', uid);
    return {
      you: user,
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
      prefs: prefs ? JSON.parse(prefs.data) : {},
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
          account: optText(e.account, 8, 'account'),
          bank: optText(e.bank, 24, 'bank'),
          note: typeof e.note === 'string' ? e.note.slice(0, 200) : '',
          sample: !!e.sample,
        };
        run(
          `insert into expenses (id, owner_id, group_id, data, updated) values (?, ?, ?, ?, ?)
           on conflict(id) do update set group_id = excluded.group_id, data = excluded.data, updated = excluded.updated`,
          id, existing?.owner_id ?? uid, groupId, JSON.stringify(data), Date.now(),
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
          method: s.method === 'cash' ? 'cash' : 'upi',
          sample: !!s.sample,
        };
        run(
          `insert into settlements (id, group_id, data, updated) values (?, ?, ?, ?)
           on conflict(id) do update set data = excluded.data, updated = excluded.updated`,
          id, groupId, JSON.stringify(data), Date.now(),
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
      case 'prefs.set': {
        const p = obj(op.prefs, 'prefs');
        const row = one('select data from prefs where user_id = ?', uid);
        const cur: Row = row ? JSON.parse(row.data) : {};
        if ('budget' in p) cur.budget = money(p.budget, 'Budget', true);
        if ('tags' in p) {
          if (!Array.isArray(p.tags) || p.tags.length > 300) fail(400, 'tags are invalid');
          cur.tags = p.tags.map((t: unknown) => text(t, 24, 'Tag'));
        }
        if ('history' in p) {
          if (!Array.isArray(p.history) || p.history.length > 120) fail(400, 'history is invalid');
          cur.history = p.history.map((h: unknown) => {
            const r = obj(h, 'month');
            if (!Number.isInteger(r.y) || !Number.isInteger(r.m) || r.m < 1 || r.m > 12) fail(400, 'month is invalid');
            return { y: r.y, m: r.m, spent: money(r.spent, 'spent', true), sample: !!r.sample };
          });
        }
        run(
          'insert into prefs (user_id, data) values (?, ?) on conflict(user_id) do update set data = excluded.data',
          uid, JSON.stringify(cur),
        );
        return;
      }
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
        const e = JSON.parse(r.data);
        e.payerId = e.payerId ? swap(e.payerId) : e.payerId;
        e.shares = Object.fromEntries(Object.entries(e.shares ?? {}).map(([k, v]) => [swap(k), v]));
        run('update expenses set data = ?, updated = ? where id = ?', JSON.stringify(e), Date.now(), r.id);
      }
      for (const r of all('select id, data from settlements where group_id = ?', g.id)) {
        const s = JSON.parse(r.data);
        s.fromId = swap(s.fromId);
        s.toId = swap(s.toId);
        run('update settlements set data = ?, updated = ? where id = ?', JSON.stringify(s), Date.now(), r.id);
      }
      run('delete from people where id = ? and id not in (select person_id from members)', claimId);
    });
    return { groupId: g.id };
  }

  async function route(req: IncomingMessage) {
    const path = new URL(req.url ?? '/', 'http://local').pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';
    if (method === 'GET' && path === '/health') return { ok: true };
    if (method === 'POST' && path === '/auth/signup') return signup(await readBody(req));
    if (method === 'POST' && path === '/auth/login') return login(await readBody(req));
    const user = auth(req);
    if (method === 'POST' && path === '/auth/logout') {
      run('delete from sessions where token = ?', sha((req.headers.authorization ?? '').slice(7)));
      return { ok: true };
    }
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
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  });
}
