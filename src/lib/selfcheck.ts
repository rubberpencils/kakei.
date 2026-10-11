import { parseSms } from './parser';
import { cashFlow, dueRecurring, equalShares, friendBalances, groupDebts, memberNets, owedBack, pairDebts, percentShares, pocket, remainingOwed, reroutes, simplify, spendIn } from './ledger';
import { handleMcp, type McpData } from './mcp';
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
eq(pocket(dinner, 'ananya'), 1200, 'only your share is spend');
eq(pocket({ ...dinner, reflect: false }, 'ananya'), 0, 'hidden');

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
eq(flow.spent, 140, 'spend is your own spend plus only your share of each split');
eq(flow.owed, 20, 'still coming back from the bill you paid');
eq(flow.byDay['2026-10-02'], 90, 'calendar shows your shares, not the full bills');

const month = spendIn([lunch, cab, theirs], [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00', method: 'upi' }], 'me', '2026-10-01', '2026-10-31');
eq(month.total, 140, 'home spend is share only');
eq(month.back, 20, 'home shows what is still to get back');
const paidForFriends: Expense = { ...cab, id: 'pf', shares: { b: 100 }, amount: 100 };
const friendsOnly = spendIn([paidForFriends], [], 'me', '2026-10-01', '2026-10-31');
eq(friendsOnly.total, 0, 'a bill paid fully for friends is not your spend');
eq(friendsOnly.back, 100, 'all of it is coming back');
eq(spendIn([{ ...cab, reflect: false }], [], 'me', '2026-10-01', '2026-10-31').back, 0, 'hidden splits stay out of personal');

const mcpData: McpData = {
  you: { id: 'me', name: 'Me', initials: 'ME' },
  people: [{ id: 'b', name: 'Bela', initials: 'BE' }],
  groups: [{ id: 'g', name: 'Airport cab', icon: 'call-split', memberIds: ['b'], note: '', kind: 'split' }],
  expenses: [lunch, cab, theirs],
  settlements: [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00', method: 'cash' }],
  budget: 1000,
  now: new Date('2026-10-15T12:00:00'),
};
const rpc = (method: string, params?: unknown, id = 1) => handleMcp(JSON.stringify({ jsonrpc: '2.0', id, method, params }), mcpData);
const asked = (name: string, args: unknown = {}) => JSON.parse(JSON.parse(rpc('tools/call', { name, arguments: args }).body).result.content[0].text);
eq(JSON.parse(rpc('initialize', { protocolVersion: '2025-03-26' }).body).result.protocolVersion, '2025-03-26', 'mcp echoes a protocol version it knows');
eq(JSON.parse(rpc('initialize', { protocolVersion: '1999-01-01' }).body).result.protocolVersion, '2025-06-18', 'mcp falls back to its newest version');
eq(handleMcp(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), mcpData).status, 202, 'mcp notifications get no body');
eq(JSON.parse(rpc('tools/list').body).result.tools.length, 5, 'mcp lists its tools');
eq(JSON.parse(rpc('nope').body).error.code, -32601, 'mcp rejects unknown methods');
eq(JSON.parse(handleMcp('{bad', mcpData).body).error.code, -32700, 'mcp reports parse errors');
eq(asked('get_summary').spent, 140, 'mcp spend is your share only');
eq(asked('get_summary').toGetBack, 20, 'mcp reports what is still to get back');
eq(asked('get_summary', { month: '2026-09' }).spent, 0, 'mcp reads other months');
eq(asked('list_transactions', { query: 'dinner' }).count, 3, 'mcp search matches the merchant');
eq(asked('list_transactions', { query: 'zzz' }).count, 0, 'mcp search filters out the rest');
eq(asked('list_transactions').transactions.find((t: { id: string }) => t.id === 'cab').yourShare, 50, 'mcp lists your share of each bill');
eq(asked('list_groups').groups[0].kind, 'quick split', 'mcp names quick splits');
eq(asked('get_balances').balances[0].net, -20, 'mcp balances read from your side');
eq(asked('get_balances').balances[0].meaning, 'you owe them', 'mcp balances say who pays whom');
eq(JSON.parse(rpc('tools/call', { name: 'get_summary', arguments: { month: 'oct' } }).body).result.isError, true, 'mcp bad input is a tool error');
eq(JSON.stringify(JSON.parse(rpc('tools/call', { name: 'list_transactions' }).body)).includes('4521'), false, 'mcp never includes account numbers');

console.log('selfcheck ok');
