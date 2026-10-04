import { parseSms } from './parser';
import { cleanVpa, readUpiResponse, upiLink } from './upi';
import { cashFlow, dueRecurring, equalShares, friendBalances, groupDebts, memberNets, owedBack, pairDebts, percentShares, pocket, remainingOwed, reroutes, simplify } from './ledger';
import type { Expense, Settlement } from './types';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: got ${String(actual)}`);
}

const samples: [string, string, Record<string, unknown>][] = [
  ['VM-HDFCBK', 'Rs.1240.00 debited from A/c XX4521 on 28-09-26 to VPA swiggy@icici. UPI Ref 426781234.', { amount: 1240, income: false, rail: 'upi', merchant: 'Swiggy', tag: 'food', account: '4521', bank: 'HDFC' }],
  ['AD-ICICIT', 'INR 3,499.00 spent using ICICI Bank Card XX9012 on 28-Sep-26 on AMAZON PAY IN.', { amount: 3499, income: false, rail: 'credit', merchant: 'Amazon', tag: 'shopping', account: '9012' }],
  ['VM-HDFCBK', 'Rs.386.00 debited from A/c XX4521 on 28-09-26 to VPA uber.india@axisbank.', { amount: 386, rail: 'upi', merchant: 'Uber', tag: 'transport' }],
  ['JD-SBIINB', 'Your A/c XX7710 is credited Rs.85,000.00 on 25/09/26 by NEFT-ACME TECHNOLOGIES PVT LTD SALARY SEP26.', { amount: 85000, income: true, rail: 'neft', merchant: 'Acme Technologies', tag: 'salary' }],
  ['VM-HDFCBK', 'Rs.2150.00 debited from A/c XX4521 on 27-09-26 to VPA blinkit.payu@hdfcbank.', { merchant: 'Blinkit', tag: 'groceries', rail: 'upi' }],
  ['AX-AXISBK', 'INR 12,340.00 debited from A/c no. XX3308 on 27-09-26 towards HDFC Bank Credit Card XX2207 payment.', { amount: 12340, transfer: true, tag: 'bills', merchant: 'Card bill', account: '3308' }],
];

for (const [sender, body, expect] of samples) {
  const got = parseSms(sender, body);
  if (!got) throw new Error(body);
  for (const [k, v] of Object.entries(expect)) {
    eq((got as Record<string, unknown>)[k], v, `${k} in ${body}`);
  }
}

eq(parseSms('VM-HDFCBK', 'OTP is 482913. Do not share it with anyone.'), null, 'otp');

const shares = equalShares(4800, ['ananya', 'aarav', 'meera', 'kabir']);
eq(Object.values(shares).reduce((a, b) => a + b, 0), 4800, 'shares');

const dinner: Expense = {
  id: 'd', merchant: 'Dinner', amount: 4800, at: '2026-09-19T12:00:00', tag: 'food', rail: 'upi',
  income: false, transfer: false, recurring: null, recurId: null, groupId: 'goa', payerId: 'ananya',
  shares, reflect: true,
};
const sets: Settlement[] = [{ id: 's', groupId: 'goa', fromId: 'aarav', toId: 'ananya', amount: 1200, at: '2026-09-25T12:00:00', method: 'upi' }];
const rem = remainingOwed([dinner], sets);
eq(owedBack(dinner, 'ananya', rem), 2400, 'owed');
eq(pocket(dinner, 'ananya', rem), 3600, 'pocket');
eq(pocket({ ...dinner, reflect: false }, 'ananya', rem), 0, 'hidden');

const debts = pairDebts([dinner], sets, 'goa');
eq(debts.find((d) => d.fromId === 'aarav'), undefined, 'aarav settled');
eq(simplify(debts).length, debts.length, 'simplify');

const chain: Expense[] = [
  { ...dinner, id: 'c1', groupId: 'trip', amount: 100, payerId: 'a', shares: { b: 100 } },
  { ...dinner, id: 'c2', groupId: 'trip', amount: 100, payerId: 'b', shares: { c: 100 } },
];
const trip = { id: 'trip', name: 'Trip', icon: 'beach', memberIds: ['b', 'c'], note: '' };
eq(groupDebts(chain, [], trip).length, 1, 'simplified by default');
eq(groupDebts(chain, [], { ...trip, simplify: false }).length, 2, 'pairwise when simplify is off');
eq(friendBalances(chain, [], [trip], 'a').find((f) => f.id === 'c')?.net, 100, 'c pays a directly');
eq(friendBalances(chain, [], [{ ...trip, simplify: false }], 'a').find((f) => f.id === 'b')?.net, 100, 'b owes a when not simplified');
eq(memberNets(pairDebts(chain, [], 'trip')).b, 0, 'b nets to zero');

const pct = percentShares(1000, { a: 33.3, b: 33.3, c: 33.4 });
eq(Object.values(pct).reduce((x, y) => x + y, 0), 1000, 'percent shares add up');

const rent: Expense = { ...dinner, id: 'r0', groupId: null, payerId: null, shares: null, recurring: 'monthly', recurId: 'rent', at: '2026-07-01T12:00:00' };
const due = dueRecurring([rent], new Date('2026-10-02T12:00:00'));
eq(due.length, 3, 'recurring catches up every missed month');
eq(due[2].id, 'rent-20261001', 'recurring id is deterministic');
eq(dueRecurring([rent, ...due], new Date('2026-10-02T12:00:00')).length, 0, 'recurring does not repeat');

const hops = [{ fromId: 'a', toId: 'b', amount: 500 }, { fromId: 'b', toId: 'c', amount: 500 }, { fromId: 'c', toId: 'd', amount: 500 }];
const hopRoutes = reroutes(hops, simplify(hops));
eq(hopRoutes.length, 1, 'only the payer who still pays gets a reroute');
eq(`${hopRoutes[0].fromId}>${hopRoutes[0].viaId}>${hopRoutes[0].toId}`, 'a>b>d', 'a now pays d instead of b');
const fan = [{ fromId: 'k', toId: 'm', amount: 300 }, { fromId: 'k', toId: 'r', amount: 200 }, { fromId: 'r', toId: 'm', amount: 500 }];
const fanRoutes = reroutes(fan, simplify(fan));
eq(fanRoutes.map((x) => `${x.fromId}>${x.viaId}>${x.toId}`).join(','), 'k>r>m', 'debt to a middle person goes straight to the end');
eq(reroutes(fan, fan).length, 0, 'nothing rerouted when not simplified');

const lunch: Expense = { ...dinner, id: 'l', groupId: null, payerId: null, shares: null, amount: 50, at: '2026-10-01T12:00:00' };
const cab: Expense = { ...dinner, id: 'cab', groupId: 'g', payerId: 'me', shares: { me: 50, b: 50 }, amount: 100, at: '2026-10-02T12:00:00' };
const theirs: Expense = { ...cab, id: 'x', payerId: 'b', shares: { me: 40, b: 40 }, amount: 80 };
const flow = cashFlow([lunch, cab, theirs], [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00', method: 'upi' }], 'me', '2026-10-01', '2026-10-31');
eq(flow.out, 150, 'money out counts the full bill you paid, not bills others paid');
eq(flow.net, 120, 'repayments come off what you spent');
eq(flow.owed, 20, 'still coming back');
eq(flow.real, 100, 'real spend is your own spend plus your share');
eq(flow.byDay['2026-10-02'], 100, 'calendar shows the full bill on the day you paid');

eq(cleanVpa(' Asha.R@OKAXIS '), 'asha.r@okaxis', 'UPI ID normalised');
eq(cleanVpa('9876543210'), null, 'bare phone is not a UPI ID');
eq(cleanVpa('a@b'), null, 'too short');
const link = upiLink({ vpa: 'asha@okaxis', amount: 576, note: 'Settle with Asha from Goa & co' });
eq(link, 'upi://pay?pa=asha@okaxis&am=576.00&cu=INR&tn=Settle%20with%20Asha%20from%20Goa%20%26%20co', 'UPI link is a plain P2P link');
eq(readUpiResponse('txnId=AX1&responseCode=00&Status=SUCCESS&txnRef=kk1'), 'success', 'UPI success');
eq(readUpiResponse('txnId=&Status=FAILURE&responseCode=ZD'), 'failed', 'UPI failure');
eq(readUpiResponse('Status=SUBMITTED'), 'pending', 'UPI submitted');
eq(readUpiResponse(''), 'cancelled', 'backed out of UPI app');
eq(readUpiResponse('NO_APP'), 'no-app', 'no UPI app');

console.log('selfcheck ok');
