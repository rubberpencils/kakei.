// Seeds a real account with a UPI ID and a group where whoever joins owes it ₹1, for testing UPI pay end to end.
// Run with the server up: npm --prefix server run upi-test
import { randomBytes } from 'node:crypto';

const base = process.env.API ?? 'http://localhost:4000';
const account = { name: 'Lalitha R', phone: '9000077777', password: 'upitest123', vpa: 'lalithar-yahoo.com@okicici' };
const id = () => randomBytes(9).toString('base64url');

async function call(path: string, body: unknown, token?: string) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

let auth = await call('/auth/signup', account);
if (auth.status === 409) auth = await call('/auth/login', account);
if (auth.status !== 200) throw new Error(auth.data.error);
const { token, you } = auth.data;

const groupId = id();
const placeholder = id();
const { data } = await call('/ops', {
  ops: [
    { type: 'group.upsert', group: { id: groupId, name: 'UPI test', icon: 'cash' } },
    { type: 'person.add', groupId, person: { id: placeholder, name: 'You' } },
    {
      type: 'expense.upsert',
      expense: { id: id(), merchant: 'UPI test', amount: 2, at: new Date().toISOString(), rail: 'upi', tag: null, groupId, payerId: you.id, shares: { [you.id]: 1, [placeholder]: 1 } },
    },
  ],
}, token);
const failed = data.results.find((r: { ok: boolean }) => !r.ok);
if (failed) throw new Error(failed.error);

const sync = await fetch(`${base}/sync`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
const code = sync.groups.find((g: { id: string }) => g.id === groupId).code;
console.log(`Group "UPI test" is ready. In the app: Groups > Join, code ${code}, then pick "You". You will owe ${account.name} ₹1 at ${account.vpa}.`);
