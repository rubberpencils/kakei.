import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { createApp } from './app.ts';
import { openDb } from './db.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: got ${JSON.stringify(actual)}`);
}

const db = openDb(':memory:');
const server = createApp(db, { cors: '*', key: randomBytes(32) });
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

try {
  const a = await call('POST', '/auth/signup', null, { name: 'Ananya', phone: '98765 43210', password: 'secret1' });
  eq(a.status, 200, 'signup a');
  const b = await call('POST', '/auth/signup', null, { name: 'Aarav', phone: '9123456780', password: 'secret2' });
  const A = a.json.token as string;
  const B = b.json.token as string;
  const aid = a.json.you.id as string;
  const bid = b.json.you.id as string;
  eq((await call('POST', '/auth/signup', null, { name: 'X', phone: '9876543210', password: 'secret1' })).status, 409, 'duplicate phone');
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

  const s1 = await call('GET', '/sync', A);
  eq(s1.json.groups.length, 1, 'a sees group');
  eq(s1.json.expenses.length, 2, 'a sees both expenses');
  eq(s1.json.prefs.budget, 50000, 'prefs');
  const code = s1.json.groups[0].code as string;

  eq((await call('GET', '/sync', B)).json.groups.length, 0, 'b sees nothing before joining');
  const inv = await call('GET', `/invite/${code}`, B);
  eq(inv.json.members.find((m: any) => m.id === 'place1').claimable, true, 'placeholder claimable');
  eq((await call('POST', '/join', B, { code, claimId: 'place1' })).status, 200, 'join');

  const s2 = await call('GET', '/sync', B);
  eq(s2.json.expenses.length, 1, 'b sees only the group expense');
  eq(s2.json.expenses[0].shares[bid], 600, 'claimed share');
  eq(s2.json.groups[0].memberIds.includes(aid), true, 'a listed for b');

  const del = await call('POST', '/ops', B, { ops: [{ type: 'expense.delete', id: 'coffee1' }] });
  eq(del.json.results[0].ok, false, 'b cannot delete a personal expense of a');

  await call('POST', '/ops', B, {
    ops: [
      { type: 'settlement.upsert', settlement: { id: 'set001', groupId: 'goa01', fromId: bid, toId: aid, amount: 600, at: '2026-09-25T12:00:00', method: 'upi' } },
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

  eq((await call('POST', '/ops', B, { ops: [{ type: 'me.set', vpa: 'not a upi id' }] })).json.results[0].ok, false, 'bad UPI ID rejected');
  await call('POST', '/ops', B, { ops: [{ type: 'me.set', vpa: ' Aarav.K@OKAXIS ' }] });
  eq((await call('GET', '/sync', B)).json.you.vpa, 'aarav.k@okaxis', 'own UPI ID normalised');
  eq((await call('GET', '/sync', A)).json.people.find((p: any) => p.id === bid).vpa, 'aarav.k@okaxis', 'co-member sees UPI ID');
  eq((await call('GET', '/sync', A)).json.people.find((p: any) => p.id === 'aonly1').vpa, null, 'placeholder has no UPI ID');
  const stored = db.prepare('select vpa from users where id = ?').get(bid) as { vpa: string };
  eq(stored.vpa.includes('aarav'), false, 'UPI ID encrypted at rest');
  const c = await call('POST', '/auth/signup', null, { name: 'Chai', phone: '9000000003', password: 'secret3', vpa: 'chai@ybl' });
  eq((await call('GET', '/sync', c.json.token)).json.you.vpa, 'chai@ybl', 'UPI ID at signup');
  eq((await call('GET', '/sync', A)).json.people.some((p: any) => p.vpa === 'chai@ybl'), false, 'strangers never see it');
  await call('POST', '/ops', B, { ops: [{ type: 'me.set', vpa: '' }] });
  eq((await call('GET', '/sync', A)).json.people.find((p: any) => p.id === bid).vpa, null, 'cleared UPI ID hides UPI option');

  eq((await call('GET', '/sync', 'nope')).status, 401, 'bad token');
  console.log('server check ok');
} finally {
  server.close();
}
