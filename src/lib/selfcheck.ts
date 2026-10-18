import { applyKey, clampCursor, editAt, pasteAt, pasteInto, shouldCap } from './keyboard-logic';
import { isPersonalSender } from './sender';
import { cleanMerchant, isRecentDupe, parseSms, parseWithRules, spanContext } from './parser';
import { cardBills, cashFlow, detectSubs, dueRecurring, equalShares, exactSteps, friendBalances, groupDebts, memberNets, owedBack, pairDebts, percentShares, pocket, remainingOwed, reroutes, simplify, spendIn, whyYouPay, youBalances } from './ledger';
import { handleMcp, type McpData } from './mcp';
import type { Expense, Settlement } from './types';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: got ${String(actual)}`);
}

const samples: [string, string, Record<string, unknown>][] = [
  ['VM-HDFCBK', 'Rs.1240.00 debited from A/c XX4521 on 28-09-26 to VPA swiggy@icici. UPI Ref 426781234.', { amount: 1240, income: false, rail: 'upi', merchant: 'Swiggy', tag: 'food', account: '4521', bank: 'HDFC' }],
  ['AD-ICICIT', 'INR 3,499.00 spent using ICICI Bank Card XX9012 on 28-Sep-26 on AMAZON PAY IN.', { amount: 3499, income: false, rail: 'credit', merchant: 'Amazon', tag: 'shopping', account: '9012' }],
  ['VM-HDFCBK', 'Rs.2499.00 spent on HDFC Bank CC XX1234 on 28-09-26 at AMAZON.', { amount: 2499, rail: 'credit', account: '1234' }],
  ['AX-AXISBK', 'INR 5,000.00 debited from A/c no. XX3308 on 27-09-26 towards HDFC Bank CC XX2207 payment.', { amount: 5000, transfer: true }],
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
eq(parseSms('VM-HDFCBK', 'Rs.120.00 debit failed for A/c XX4521. Transaction unsuccessful.') , null, 'failed debit is ignored');
eq(parseSms('VM-HDFCBK', 'Rs.250.00 credited to A/c XX4521 on 02-10-26 towards refund from SWIGGY.')?.income, true, 'a refund is money in');
eq(parseSms('VM-HDFCBK', 'Rs.250.00 credited to A/c XX4521 on 02-10-26 towards refund from SWIGGY.')?.merchant, 'Swiggy', 'refund merchant is cleaned');
eq(parseSms('AX-AXISBK', 'INR 199.00 debited from A/c XX3308 on 01-10-26 towards Netflix Autopay.')?.tag, 'entertainment', 'autopay keeps the merchant tag');
eq(parseSms('VM-HDFCBK', 'Rs.40.00 debited from UPI Lite on 03-10-26 to VPA chai@okhdfcbank.')?.rail, 'upi', 'upi lite stays upi');
eq(parseSms('VM-HDFCBK', 'Rs.499.00 credited to A/c XX4521 on 02-10-26. Transaction reversed for SWIGGY.')?.income, true, 'a reversal is money back');
eq(cleanMerchant('SWIGGY UPI 123456789012'), 'Swiggy', 'merchant drops upi and a long ref');
const taughtBody = 'Wallet paid CAFE MOCHA at the counter ref 80.00 done';
const nextBody = 'Wallet paid CAFE MOCHA at the counter ref 90.00 done';
const amountAt = spanContext(taughtBody, '80.00');
const merchantAt = spanContext(taughtBody, 'CAFE MOCHA');
if (!amountAt || !merchantAt) throw new Error('span');
const taught = parseWithRules('VM-NEWBK', nextBody, [{
  sender: 'VM-NEWBK', amountBefore: amountAt.before, amountAfter: amountAt.after, merchantBefore: merchantAt.before, merchantAfter: merchantAt.after,
}], [{ key: 'cafe mocha', tag: 'coffee' }]);
eq(taught?.amount, 90, 'a taught format reads the next amount');
eq(taught?.tag, 'coffee', 'a learned merchant sets the tag');
eq(isRecentDupe([{ merchant: 'swiggy', amount: 100, at: 1_000 }], 'Swiggy', 100, 20_000), true, 'the same merchant and amount within 3 minutes is a duplicate');
eq(isRecentDupe([{ merchant: 'swiggy', amount: 100, at: 1_000 }], 'Swiggy', 100, 200_000), false, 'the same spend after 3 minutes is kept');

const shares = equalShares(4800, ['ananya', 'aarav', 'meera', 'kabir']);
eq(Object.values(shares).reduce((a, b) => a + b, 0), 4800, 'shares');

const dinner: Expense = {
  id: 'd', merchant: 'Dinner', amount: 4800, at: '2026-09-19T12:00:00', tag: 'food', rail: 'upi',
  income: false, transfer: false, recurring: null, recurId: null, groupId: 'goa', payerId: 'ananya',
  shares, reflect: true,
};
const sets: Settlement[] = [{ id: 's', groupId: 'goa', fromId: 'aarav', toId: 'ananya', amount: 1200, at: '2026-09-25T12:00:00' }];
const rem = remainingOwed([dinner], sets);
eq(owedBack(dinner, 'ananya', rem), 2400, 'owed');
eq(pocket(dinner, 'ananya'), 1200, 'only your share is spend');
eq(pocket({ ...dinner, reflect: false }, 'ananya'), 0, 'hidden');
const sub = detectSubs([
  { ...dinner, id: 'n1', groupId: null, payerId: null, shares: null, merchant: 'Netflix', amount: 199, at: '2026-01-15T12:00:00' },
  { ...dinner, id: 'n2', groupId: null, payerId: null, shares: null, merchant: 'Netflix', amount: 199, at: '2026-02-15T12:00:00' },
  { ...dinner, id: 'n3', groupId: null, payerId: null, shares: null, merchant: 'Netflix', amount: 210, at: '2026-03-16T12:00:00' },
]);
eq(sub[0]?.merchant, 'Netflix', 'three monthly charges look like a subscription');

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
const multi: Expense = { ...dinner, id: 'm', groupId: 'trip', amount: 1000, payerId: 'a', payers: [{ id: 'a', amount: 600 }, { id: 'b', amount: 400 }], shares: { a: 400, b: 300, c: 300 } };
const multiDebts = pairDebts([multi], [], 'trip');
eq(multiDebts.find((d) => d.fromId === 'c' && d.toId === 'a')?.amount, 200, 'two payers: c owes the larger payer 200');
eq(multiDebts.find((d) => d.fromId === 'c' && d.toId === 'b')?.amount, 100, 'two payers: c owes the other payer 100');
eq(memberNets(pairDebts(chain, [], 'trip')).b, 0, 'b nets to zero');
const pairs40 = [{ fromId: 'a', toId: 'b', amount: 100 }, { fromId: 'b', toId: 'c', amount: 40 }];
const hop = exactSteps(pairs40, simplify(pairs40)).find((s) => s.toId === 'c');
eq(hop?.amount, 40, 'A pays C the 40');
eq(hop?.because[0]?.viaId, 'b', 'the 40 that A pays C names B');
const dinnerWhy = whyYouPay('ananya', 'aarav', [dinner], sets, 'goa');
eq(dinnerWhy.some((l) => l.direction === 'owed' && l.amount === 1200), true, 'why lists the share a friend still owes');

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
const flow = cashFlow([lunch, cab, theirs], [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00' }], 'me', '2026-10-01', '2026-10-31');
eq(flow.spent, 140, 'spend is your own spend plus only your share of each split');
eq(flow.owed, 20, 'still coming back from the bill you paid');
eq(flow.byDay['2026-10-02'], 90, 'calendar shows your shares, not the full bills');

const month = spendIn([lunch, cab, theirs], [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00' }], 'me', '2026-10-01', '2026-10-31');
eq(month.total, 140, 'home spend is share only');
eq(month.back, 20, 'home shows what is still to get back');
const paidForFriends: Expense = { ...cab, id: 'pf', shares: { b: 100 }, amount: 100 };
const friendsOnly = spendIn([paidForFriends], [], 'me', '2026-10-01', '2026-10-31');
eq(friendsOnly.total, 0, 'a bill paid fully for friends is not your spend');
eq(friendsOnly.back, 100, 'all of it is coming back');
eq(spendIn([{ ...cab, reflect: false }], [], 'me', '2026-10-01', '2026-10-31').back, 0, 'hidden splits stay out of personal');

const tripGroup = { id: 'g', name: 'Trip', icon: 'beach', memberIds: ['b'], note: '' };
const owedBalances = youBalances([cab], [], [tripGroup], 'me');
eq(owedBalances.owedTotal, 50, 'balances: what friends owe you');
eq(owedBalances.owed[0].id, 'b', 'balances: names the person who owes you');
eq(owedBalances.owed[0].lines[0].groupId, 'g', 'balances: names the group it comes from');
eq(owedBalances.oweTotal, 0, 'balances: nothing owed by you');
const oweBalances = youBalances([theirs], [], [tripGroup], 'me');
eq(oweBalances.oweTotal, 40, 'balances: what you owe');
eq(oweBalances.owe[0].id, 'b', 'balances: names who you owe');

const swipe1: Expense = { ...lunch, id: 'c1', rail: 'credit', amount: 780, account: '9012', bank: 'ICICI', at: '2026-10-01T12:00:00' };
const swipe2: Expense = { ...swipe1, id: 'c2', amount: 2799, at: '2026-10-02T12:00:00' };
const cardPay: Expense = { ...lunch, id: 'pay', transfer: true, rail: 'upi', amount: 1000, account: '3308', bank: 'HDFC', at: '2026-10-05T12:00:00' };
eq(cardBills([swipe1, swipe2], 'me')[0].due, 3579, 'card bill adds up credit card spend by itself');
eq(cardBills([swipe1, swipe2, cardPay], 'me')[0].due, 2579, 'a card bill payment takes it down');
eq(cardBills([swipe1, swipe2, { ...cardPay, amount: 3579 }], 'me').length, 0, 'a paid card has no bill');
eq(cardBills([{ ...cab, id: 'fc', rail: 'credit', payerId: 'b', amount: 500 }], 'me').length, 0, 'a friend\'s card is not your bill');
eq(cardBills([{ ...cab, id: 'mc', rail: 'credit' }], 'me')[0].due, 100, 'a split you paid by card is the full charge on your card');
eq(cardBills([lunch], 'me').length, 0, 'cash and UPI are not on a card bill');

const mcpData: McpData = {
  you: { id: 'me', name: 'Me', initials: 'ME' },
  people: [{ id: 'b', name: 'Bela', initials: 'BE' }],
  groups: [{ id: 'g', name: 'Airport cab', icon: 'call-split', memberIds: ['b'], note: '', kind: 'split' }],
  expenses: [lunch, cab, theirs],
  settlements: [{ id: 'p', groupId: 'g', fromId: 'b', toId: 'me', amount: 30, at: '2026-10-03T12:00:00' }],
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

// The in-app keyboard: what each key does to the text.
const typed = (field: Parameters<typeof applyKey>[0], keys: string) => Array.from(keys).reduce((v, k) => applyKey(field, v, k), '');
const money = { mode: 'decimal' as const };
eq(typed(money, '12.509'), '12.50', 'amount stops at two decimals');
eq(typed(money, '.5'), '0.5', 'a lone dot becomes 0.');
eq(typed(money, '1.2.3'), '1.23', 'amount takes one dot');
eq(typed(money, '007'), '7', 'amount drops leading zeros');
eq(typed(money, 'a1b2'), '12', 'amount ignores letters');
eq(applyKey(money, '1234567890', '1'), '1234567890', 'amount has a length limit');
eq(applyKey(money, '12', 'del'), '1', 'delete removes the last digit');
eq(typed({ mode: 'phone' }, '+91 98a76'), '+919876', 'phone keeps digits and a leading plus');
eq(typed({ mode: 'number' }, '1.5'), '15', 'whole numbers have no dot');
eq(typed({ mode: 'text', maxLength: 3 }, 'abcd'), 'abc', 'maxLength is respected');
eq(applyKey({ mode: 'text', multiline: true }, 'a', 'enter'), 'a\n', 'multiline enter adds a line');
eq(applyKey({ mode: 'text' }, 'a', 'enter'), 'a', 'single line enter adds nothing');
eq(shouldCap('words', ''), true, 'words start with a capital');
eq(shouldCap('words', 'Goa '), true, 'each word gets a capital');
eq(shouldCap('words', 'Goa'), false, 'mid word stays lower case');
eq(shouldCap('sentences', 'Hi. '), true, 'sentences restart after a full stop');
eq(shouldCap('sentences', 'Hi'), false, 'sentences do not restart mid way');
eq(shouldCap('none', ''), false, 'caps can be off');
eq(shouldCap('chars', 'AB'), true, 'codes are all capitals');
eq(pasteInto(money, '', ' ₹1,250.75 '), '1250.75', 'pasting into an amount keeps only the number');
eq(pasteInto({ mode: 'text' }, 'a', ' b\n c '), 'ab c', 'pasting collapses whitespace on one line');

// The caret can sit anywhere in the text.
const at = (field: Parameters<typeof editAt>[0], value: string, cursor: number, key: string) => editAt(field, value, cursor, key);
eq(JSON.stringify(at({ mode: 'text' }, 'helo', 3, 'l')), JSON.stringify({ value: 'hello', cursor: 4 }), 'a letter goes in at the caret');
eq(JSON.stringify(at({ mode: 'text' }, 'hello', 3, 'del')), JSON.stringify({ value: 'helo', cursor: 2 }), 'delete removes the letter before the caret');
eq(JSON.stringify(at({ mode: 'text' }, 'hello', 0, 'del')), JSON.stringify({ value: 'hello', cursor: 0 }), 'delete at the start does nothing');
eq(JSON.stringify(at({ mode: 'text' }, 'a😀b', 2, 'del')), JSON.stringify({ value: 'ab', cursor: 1 }), 'delete takes a whole emoji');
eq(JSON.stringify(at({ mode: 'text', multiline: true }, 'ab', 1, 'enter')), JSON.stringify({ value: 'a\nb', cursor: 2 }), 'return splits the line at the caret');
eq(at(money, '150', 1, '2').value, '1250', 'amount takes a digit in the middle');
eq(at(money, '1250', 2, '.').value, '12.50', 'a dot can go in the middle of an amount');
eq(at(money, '1250', 1, '.').value, '1250', 'a dot that leaves three decimals is refused');
eq(at(money, '50', 0, '.').value, '0.50', 'a dot at the start gets a zero in front');
eq(at(money, '1.5', 0, '.').value, '1.5', 'only one dot per amount');
eq(at(money, '5', 0, '0').value, '5', 'a zero typed in front of an amount is dropped');
eq(at({ mode: 'number' }, '9', 0, '0').value, '9', 'a zero typed in front of a number is dropped');
eq(at({ mode: 'number' }, '10', 1, '0').value, '100', 'a zero in the middle of a number stays');
eq(at({ mode: 'phone' }, '9876', 2, '+').value, '9876', 'a plus only goes first in a phone number');
eq(at({ mode: 'phone' }, '9876', 0, '+').value, '+9876', 'a plus can go first in a phone number');
eq(pasteAt({ mode: 'text' }, 'ac', 1, 'b').value, 'abc', 'paste lands at the caret');
eq(pasteAt({ mode: 'text' }, 'ac', 1, 'b').cursor, 2, 'the caret ends after what was pasted');
eq(clampCursor('abc', 9), 3, 'the caret never passes the end');

eq(isPersonalSender('VM-HDFCBK'), false, 'a bank short code is not a personal sender');
eq(isPersonalSender('+919876543210'), true, 'a plus phone number is personal');
eq(isPersonalSender('9876543210'), true, 'a plain phone number is personal');
eq(isPersonalSender('+91 98765 43210'), true, 'spaces in a phone number still count as personal');

console.log('selfcheck ok');
