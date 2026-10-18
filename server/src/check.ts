import type { AddressInfo } from 'node:net';

import { createApp } from './app.ts';
import { openDb } from './db.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: got ${JSON.stringify(actual)}`);
}

const db = openDb(':memory:');
const codes = new Map<string, string>();
const server = createApp(db, { cors: '*', sendOtp: (phone, code) => { codes.set(phone, code); } });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function signup(name: string, phone: string, password: string) {
  const digits = phone.replace(/\D/g, '');
  const sent = await call('POST', '/auth/otp', null, { phone, purpose: 'signup' });
  if (sent.status !== 200) return sent;
  return call('POST', '/auth/signup', null, { name, phone, password, code: codes.get(digits) });
}

try {
  const a = await signup('Ananya', '98765 43210', 'secret1');
  eq(a.status, 200, 'signup a');
  const b = await signup('Aarav', '9123456780', 'secret2');
  const A = a.json.token as string;
  const B = b.json.token as string;
  const aid = a.json.you.id as string;
  const bid = b.json.you.id as string;
  eq((await signup('X', '9876543210', 'secret1')).status, 409, 'duplicate phone');
  eq((await call('POST', '/auth/signup', null, { name: 'Z', phone: '9000000001', password: 'secret1', code: '000000' })).status, 400, 'signup needs a real code');
  eq((await call('POST', '/auth/login', null, { phone: '9876543210', password: 'nope00' })).status, 401, 'bad password');
  eq((await call('POST', '/auth/login', null, { phone: '9876543210', password: 'secret1' })).status, 200, 'login');

  const dinner = {
    id: 'dinner1', merchant: 'Dinner', amount: 1200, at: '2026-09-19T12:00:00', tag: 'food', rail: 'upi',
    income: false, transfer: false, recurring: null, recurId: null,
    groupId: 'goa01', payerId: aid, shares: { [aid]: 600, place1: 600 }, reflect: true,
  };
  const ops = await call('POST', '/ops', A, {
    ops: [
      { type: 'group.upsert', group: { id: 'goa01', name: 'Goa', icon: 'beach', note: '' } },
      { type: 'person.add', groupId: 'goa01', person: { id: 'place1', name: 'Aarav' } },
      { type: 'expense.upsert', expense: dinner },
      { type: 'expense.upsert', expense: { ...dinner, id: 'coffee1', amount: 200, groupId: null, payerId: null, shares: null } },
      { type: 'expense.upsert', expense: { ...dinner, id: 'bad001', shares: { [aid]: 100 } } },
      { type: 'prefs.set', prefs: { budget: 50000, tags: ['food'] } },
    ],
  });
  eq(ops.json.results.filter((r: any) => r.ok).length, 5, 'five ops apply');
  eq(ops.json.results[4].ok, false, 'split that does not add up is rejected');
  const multi = await call('POST', '/ops', A, { ops: [{ type: 'expense.upsert', expense: { ...dinner, id: 'multi1', amount: 1000, payerId: aid, payers: [{ id: aid, amount: 600 }, { id: 'place1', amount: 400 }], shares: { [aid]: 500, place1: 500 }, items: [{ name: 'Pizza', amount: 1000, memberIds: [aid, 'place1'] }] } }] });
  eq(multi.json.results[0].ok, true, 'two payers and an item save');
  eq((await call('GET', '/sync', A)).json.expenses.find((e: any) => e.id === 'multi1').payers[0].amount, 600, 'payers come back');

  const s1 = await call('GET', '/sync', A);
  eq(s1.json.groups.length, 1, 'a sees group');
  eq(s1.json.expenses.length, 2, 'a sees the group expenses, and the personal one was never stored');
  eq(Object.keys(s1.json.prefs).length, 0, 'budget and tags are not kept on the server');
  eq(s1.json.pro, false, 'free unless the server makes everyone pro');
  db.prepare('update users set pro_until = ? where id = ?').run(Date.now() + 60_000, aid);
  eq((await call('GET', '/sync', A)).json.pro, true, 'pro until a future time');
  db.prepare('update users set pro_until = ? where id = ?').run(Date.now() - 1, aid);
  eq((await call('GET', '/sync', A)).json.pro, false, 'pro ends when it expires');
  eq((db.prepare('select count(*) as n from expenses where id = ?').get('coffee1') as { n: number }).n, 0, 'a personal expense is ignored');
  eq((db.prepare('select count(*) as n from prefs').get() as { n: number }).n, 0, 'no prefs row is written');
  const stored = db.prepare('select data from expenses where id = ?').get('dinner1') as { data: string };
  eq(stored.data.startsWith('enc1:'), true, 'an expense is sealed in the database');
  eq(stored.data.includes('Dinner'), false, 'the merchant is not readable in the database file');
  const withCard = await call('POST', '/ops', A, { ops: [{ type: 'expense.upsert', expense: { ...dinner, id: 'card001', account: '4521', bank: 'HDFC' } }] });
  eq(withCard.json.results[0].ok, true, 'a card spend in a group saves');
  const card = (await call('GET', '/sync', A)).json.expenses.find((e: any) => e.id === 'card001');
  eq(card.account, null, 'the account digits are not kept');
  eq(card.bank, null, 'the bank is not kept');
  await call('POST', '/ops', A, { ops: [{ type: 'expense.delete', id: 'card001' }] });
  const code = s1.json.groups[0].code as string;

  eq((await call('GET', '/sync', B)).json.groups.length, 0, 'b sees nothing before joining');
  const inv = await call('GET', `/invite/${code}`, B);
  eq(inv.json.members.find((m: any) => m.id === 'place1').claimable, true, 'placeholder claimable');
  eq((await call('POST', '/join', B, { code, claimId: 'place1' })).status, 200, 'join');

  const s2 = await call('GET', '/sync', B);
  eq(s2.json.expenses.length, 2, 'b sees the group expenses');
  eq(s2.json.expenses[0].shares[bid], 600, 'claimed share');
  eq(s2.json.groups[0].memberIds.includes(aid), true, 'a listed for b');

  db.prepare("insert into expenses (id, owner_id, group_id, data, updated) values ('old001', ?, null, '{}', 1)").run(aid);
  db.prepare("insert into prefs (user_id, data) values (?, '{}')").run(aid);
  const del = await call('POST', '/ops', B, { ops: [{ type: 'expense.delete', id: 'old001' }] });
  eq(del.json.results[0].ok, false, 'b cannot delete a personal expense of a');
  await call('POST', '/ops', A, { ops: [{ type: 'personal.purge' }] });
  eq((db.prepare('select count(*) as n from expenses where id = ?').get('old001') as { n: number }).n, 0, 'purge clears old personal expenses');
  eq((db.prepare('select count(*) as n from prefs').get() as { n: number }).n, 0, 'purge clears old prefs');

  await call('POST', '/ops', B, {
    ops: [
      { type: 'settlement.upsert', settlement: { id: 'set001', groupId: 'goa01', fromId: bid, toId: aid, amount: 600, at: '2026-09-25T12:00:00' } },
      { type: 'expense.upsert', expense: { ...s2.json.expenses[0], reflect: false } },
    ],
  });
  const s3 = await call('GET', '/sync', A);
  eq(s3.json.settlements.length, 1, 'a sees settlement');
  eq(s3.json.expenses.find((e: any) => e.id === 'dinner1').reflect, true, 'reflect is per person');
  eq((await call('GET', '/sync', B)).json.expenses[0].reflect, false, 'b hid it');

  const reuse = await call('POST', '/ops', A, {
    ops: [
      { type: 'group.upsert', group: { id: 'flat02', name: 'Flat', icon: 'home', note: '' } },
      { type: 'person.add', groupId: 'flat02', person: { id: bid, name: 'B' } },
      { type: 'group.upsert', group: { id: 'priv04', name: 'Private', icon: 'home', note: '' } },
      { type: 'person.add', groupId: 'priv04', person: { id: 'aonly1', name: 'Hidden' } },
    ],
  });
  eq(reuse.json.results[1].ok, true, 'a known person can join a second group');
  const steal = await call('POST', '/ops', B, {
    ops: [
      { type: 'group.upsert', group: { id: 'solo03', name: 'Solo', icon: 'home', note: '' } },
      { type: 'person.add', groupId: 'solo03', person: { id: 'aonly1', name: 'X' } },
    ],
  });
  eq(steal.json.results[1].ok, false, 'cannot pull in a stranger by id');

  eq(s1.json.groups[0].simplify, true, 'simplify on by default');
  await call('POST', '/ops', A, { ops: [{ type: 'group.upsert', group: { id: 'goa01', name: 'Goa', icon: 'beach', note: '', simplify: false } }] });
  eq((await call('GET', '/sync', B)).json.groups.find((g: any) => g.id === 'goa01').simplify, false, 'simplify off syncs to members');

  eq(s1.json.groups[0].kind, 'group', 'groups are full groups by default');
  const split = await call('POST', '/ops', A, {
    ops: [
      { type: 'group.upsert', group: { id: 'split05', name: 'Cab home', icon: 'call-split', note: '', kind: 'split' } },
      { type: 'person.add', groupId: 'split05', person: { id: 'friend5', name: 'Meera' } },
      { type: 'expense.upsert', expense: { ...dinner, id: 'cab001', merchant: 'Cab home', amount: 300, groupId: 'split05', payerId: aid, shares: { [aid]: 150, friend5: 150 } } },
    ],
  });
  eq(split.json.results.filter((r: any) => r.ok).length, 3, 'a quick split is one group, one person and one bill');
  eq((await call('GET', '/sync', A)).json.groups.find((g: any) => g.id === 'split05').kind, 'split', 'split kind syncs');
  eq((await call('GET', '/sync', A)).json.people.some((p: any) => 'vpa' in p), false, 'UPI IDs are no longer kept');
  const columns = db.prepare('pragma table_info(users)').all() as { name: string }[];
  eq(columns.some((col) => col.name === 'vpa'), false, 'no UPI ID column');

  eq((await call('GET', '/sync', 'nope')).status, 401, 'bad token');
  const { makeVault } = await import('./vault.ts');
  const vault = makeVault(Buffer.alloc(32, 7));
  const sealed = vault.seal('{"a":1}');
  eq(vault.open(sealed), '{"a":1}', 'a sealed value opens with the same key');
  eq(vault.open('{"old":true}'), '{"old":true}', 'a plain legacy value still reads');
  let wrong = false;
  try {
    makeVault(Buffer.alloc(32, 8)).open(sealed);
  } catch {
    wrong = true;
  }
  eq(wrong, true, 'a sealed value does not open with another key');
  const sent = await call('POST', '/auth/otp', null, { phone: '9876543210', purpose: 'reset' });
  eq(sent.status, 200, 'reset code');
  eq((await call('POST', '/auth/reset', null, { phone: '9876543210', otp: codes.get('9876543210'), password: 'secret9' })).status, 200, 'password reset');
  eq((await call('POST', '/auth/login', null, { phone: '9876543210', password: 'secret1' })).status, 401, 'old password stops working');
  const again = await call('POST', '/auth/login', null, { phone: '9876543210', password: 'secret9' });
  eq(again.status, 200, 'new password works');
  const A2 = again.json.token as string;
  const dumped = await call('GET', '/account/export', A2);
  eq(dumped.status, 200, 'export');
  eq(dumped.json.account.phone, '9876543210', 'export has the phone');
  eq(JSON.stringify(dumped.json).includes('secret'), false, 'export has no password');
  eq((await call('POST', '/account/delete', A2, { password: 'nope' })).status, 401, 'delete needs the password');
  eq((await call('POST', '/account/delete', A2, { password: 'secret9' })).status, 200, 'delete account');
  eq((await call('GET', '/sync', A2)).status, 401, 'deleted account cannot sync');
  eq((db.prepare('select created_by from groups where id = ?').get('goa01') as { created_by: string }).created_by, bid, 'a shared group moves to the other account');
  eq((db.prepare('select count(*) as n from groups where id = ?').get('priv04') as { n: number }).n, 0, 'a group with no other account is removed');
  eq((db.prepare('select user_id from people where id = ?').get(aid) as { user_id: string | null }).user_id, null, 'the person is no longer tied to the deleted account');
  eq((await call('POST', '/backup', B, { wrap: 'wrap', blob: 'sealed-blob' })).status, 402, 'backup is pro');
  db.prepare('update users set pro_until = ? where id = ?').run(Date.now() + 60_000, bid);
  eq((await call('POST', '/backup', B, { wrap: 'wrap', blob: 'sealed-blob' })).status, 200, 'backup stored');
  eq((db.prepare('select blob from backups where user_id = ?').get(bid) as { blob: string }).blob.includes('Dinner'), false, 'the merchant is not in the backup blob');
  eq((await call('GET', '/backup', B)).json.blob, 'sealed-blob', 'backup comes back');
  const made = await call('POST', '/mcp/create', B, { confirm: true });
  eq(made.status, 200, 'remote mcp');
  const pub = made.json.publicId as string;
  const tok = made.json.token as string;
  const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  eq((await call('POST', `/m/${pub}`, tok, rpc)).status, 200, 'remote mcp answers');
  eq((await call('POST', '/mcp/disable', B, {})).status, 200, 'remote mcp off');
  eq((await call('POST', `/m/${pub}`, tok, rpc)).status, 403, 'off keeps the token but refuses');
  eq((await call('POST', '/mcp/enable', B, {})).status, 200, 'remote mcp on');
  const rotated = await call('POST', '/mcp/regenerate', B, {});
  eq((await call('POST', `/m/${pub}`, tok, rpc)).status, 401, 'old token dies');
  eq((await call('POST', `/m/${pub}`, rotated.json.token, rpc)).status, 200, 'new token works');
  eq((await call('POST', '/mcp/snapshot', B, { expenses: [{ account: '4521' }] })).status, 400, 'snapshot rejects an account');
  const third = await signup('Chitra', '9000000088', 'secret1');
  db.prepare('update users set pro_until = ? where id = ?').run(Date.now() + 60_000, third.json.you.id);
  const other = await call('POST', '/mcp/create', third.json.token, { confirm: true });
  eq(other.json.publicId !== pub, true, 'each account has its own public id');
  eq((await call('POST', '/billing/play', B, { purchaseToken: 'tok', productId: 'kakei_pro_monthly' })).status, 501, 'this server does not sell Pro');
  const sellingDb = openDb(':memory:');
  const selling = createApp(sellingDb, {
    cors: '*',
    sendOtp: (phone, code) => { codes.set(phone, code); },
    verifyPlay: async () => ({ expiry: Date.now() + 60_000 }),
  });
  await new Promise<void>((done) => selling.listen(0, '127.0.0.1', done));
  const sellBase = `http://127.0.0.1:${(selling.address() as AddressInfo).port}`;
  const sellCall = (method: string, path: string, token: string | null, body?: unknown) =>
    fetch(sellBase + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (res) => ({ status: res.status, json: (await res.json()) as any }));
  const buyerSent = await sellCall('POST', '/auth/otp', null, { phone: '9000000099', purpose: 'signup' });
  eq(buyerSent.status, 200, 'buyer code');
  const buyer = await sellCall('POST', '/auth/signup', null, { name: 'Buyer', phone: '9000000099', password: 'secret1', code: codes.get('9000000099') });
  const bought = await sellCall('POST', '/billing/play', buyer.json.token, { purchaseToken: 'tok', productId: 'kakei_pro_yearly' });
  eq(bought.status, 200, 'play purchase');
  eq((await sellCall('GET', '/sync', buyer.json.token)).json.pro, true, 'pro until moves forward');
  selling.close();
  const hosted = createApp(openDb(':memory:'), { cors: '*', everyonePro: false });
  await new Promise<void>((done) => hosted.listen(0, '127.0.0.1', done));
  const hostedBase = `http://127.0.0.1:${(hosted.address() as AddressInfo).port}`;
  const noSms = await fetch(hostedBase + '/auth/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9000000002', purpose: 'signup' }) });
  eq(noSms.status, 503, 'hosted server without a text gateway cannot send a code');
  hosted.close();
  console.log('server check ok');
} finally {
  server.close();
}
