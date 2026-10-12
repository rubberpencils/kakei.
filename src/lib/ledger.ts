import type { Expense, Group, Person, Settlement } from './types';
import { dayKey, localNoon } from './format';

export type Debt = { fromId: string; toId: string; amount: number };

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function equalShares(amount: number, ids: string[]) {
  const shares: Record<string, number> = {};
  if (!ids.length) return shares;
  const base = Math.floor((amount / ids.length) * 100) / 100;
  let used = 0;
  ids.forEach((id, i) => {
    const v = i === ids.length - 1 ? round2(amount - used) : base;
    shares[id] = v;
    used = round2(used + v);
  });
  return shares;
}

export function pairDebts(expenses: Expense[], settlements: Settlement[], groupId: string): Debt[] {
  const map = new Map<string, number>();
  const add = (from: string, to: string, amt: number) => {
    if (from === to || amt <= 0) return;
    const k = `${from}|${to}`;
    map.set(k, round2((map.get(k) || 0) + amt));
  };
  for (const e of expenses) {
    if (e.groupId !== groupId || !e.shares || !e.payerId) continue;
    for (const [id, share] of Object.entries(e.shares)) {
      if (id !== e.payerId) add(id, e.payerId, share);
    }
  }
  for (const s of settlements) {
    if (s.groupId !== groupId) continue;
    add(s.toId, s.fromId, s.amount);
  }
  const seen = new Set<string>();
  const out: Debt[] = [];
  for (const [k, v] of map) {
    if (seen.has(k)) continue;
    const [from, to] = k.split('|');
    const revK = `${to}|${from}`;
    const rev = map.get(revK) || 0;
    seen.add(k);
    seen.add(revK);
    const net = round2(v - rev);
    if (net > 0.5) out.push({ fromId: from, toId: to, amount: net });
    else if (net < -0.5) out.push({ fromId: to, toId: from, amount: round2(-net) });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export function simplify(debts: Debt[]): Debt[] {
  const net = new Map<string, number>();
  for (const d of debts) {
    net.set(d.fromId, round2((net.get(d.fromId) || 0) - d.amount));
    net.set(d.toId, round2((net.get(d.toId) || 0) + d.amount));
  }
  const cred = [...net.entries()].filter(([, v]) => v > 0.5).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const deb = [...net.entries()].filter(([, v]) => v < -0.5).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v);
  const out: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < cred.length && j < deb.length) {
    const amt = Math.min(cred[i].v, deb[j].v);
    if (amt > 0.5) out.push({ fromId: deb[j].k, toId: cred[i].k, amount: round2(amt) });
    cred[i].v -= amt;
    deb[j].v -= amt;
    if (cred[i].v < 0.5) i += 1;
    if (deb[j].v < 0.5) j += 1;
  }
  return out;
}

function owesOnTo(pairs: Debt[], fromId: string, toId: string) {
  const seen = new Set([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === toId) return true;
    for (const d of pairs) {
      if (d.fromId === cur && !seen.has(d.toId)) {
        seen.add(d.toId);
        queue.push(d.toId);
      }
    }
  }
  return false;
}

export type Reroute = { fromId: string; viaId: string; toId: string; amount: number };

// Each pairwise debt that simplification removed, and who the payer now pays instead.
export function reroutes(pairs: Debt[], simple: Debt[]): Reroute[] {
  const out: Reroute[] = [];
  for (const p of pairs) {
    if (simple.some((s) => s.fromId === p.fromId && s.toId === p.toId)) continue;
    const to = simple.find((s) => s.fromId === p.fromId && s.toId !== p.toId && owesOnTo(pairs, p.toId, s.toId));
    if (to) out.push({ fromId: p.fromId, viaId: p.toId, toId: to.toId, amount: p.amount });
  }
  return out;
}

export function groupDebts(expenses: Expense[], settlements: Settlement[], group: Pick<Group, 'id' | 'simplify'>) {
  const pairs = pairDebts(expenses, settlements, group.id);
  return group.simplify === false ? pairs : simplify(pairs);
}

export function memberNets(debts: Debt[]) {
  const net: Record<string, number> = {};
  for (const d of debts) {
    net[d.fromId] = round2((net[d.fromId] || 0) - d.amount);
    net[d.toId] = round2((net[d.toId] || 0) + d.amount);
  }
  return net;
}

export type FriendBalance = { id: string; net: number; groups: { groupId: string; net: number }[] };

export function friendBalances(expenses: Expense[], settlements: Settlement[], groups: Group[], youId: string): FriendBalance[] {
  const map = new Map<string, FriendBalance>();
  const touch = (id: string) => {
    if (!map.has(id)) map.set(id, { id, net: 0, groups: [] });
    return map.get(id)!;
  };
  for (const g of groups) {
    for (const pid of g.memberIds) touch(pid);
    for (const d of groupDebts(expenses, settlements, g)) {
      const other = d.toId === youId ? d.fromId : d.fromId === youId ? d.toId : null;
      if (!other) continue;
      const signed = d.toId === youId ? d.amount : -d.amount;
      const row = touch(other);
      row.net = round2(row.net + signed);
      row.groups.push({ groupId: g.id, net: signed });
    }
  }
  map.delete(youId);
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function youNet(debts: Debt[], youId: string) {
  let owed = 0;
  let owe = 0;
  for (const d of debts) {
    if (d.toId === youId) owed += d.amount;
    if (d.fromId === youId) owe += d.amount;
  }
  return { owed: round2(owed), owe: round2(owe), net: round2(owed - owe) };
}

export type BalanceLine = { groupId: string; amount: number };
export type BalanceRow = { id: string; amount: number; lines: BalanceLine[] };

/**
 * Who owes you and who you owe, per person, with the group each amount comes from. Each group is worked out on its
 * own (same as the Home cards), so the totals here are exactly the numbers on those cards.
 */
export function youBalances(expenses: Expense[], settlements: Settlement[], groups: Group[], youId: string) {
  const owed = new Map<string, BalanceRow>();
  const owe = new Map<string, BalanceRow>();
  const bump = (map: Map<string, BalanceRow>, id: string, groupId: string, amount: number) => {
    const row = map.get(id) ?? { id, amount: 0, lines: [] };
    row.amount = round2(row.amount + amount);
    row.lines.push({ groupId, amount: round2(amount) });
    map.set(id, row);
  };
  for (const g of groups) {
    for (const d of groupDebts(expenses, settlements, g)) {
      if (d.toId === youId) bump(owed, d.fromId, g.id, d.amount);
      else if (d.fromId === youId) bump(owe, d.toId, g.id, d.amount);
    }
  }
  const list = (m: Map<string, BalanceRow>) =>
    [...m.values()].map((r) => ({ ...r, lines: r.lines.sort((a, b) => b.amount - a.amount) })).sort((a, b) => b.amount - a.amount);
  const sum = (rows: BalanceRow[]) => round2(rows.reduce((a, r) => a + r.amount, 0));
  const o = list(owed);
  const w = list(owe);
  return { owed: o, owe: w, owedTotal: sum(o), oweTotal: sum(w) };
}

export type CardBill = {
  key: string;
  bank: string | null;
  account: string | null;
  due: number;
  // Card purchases that make up what is still due, newest first.
  charges: Expense[];
  lastPaid: string | null;
};

/**
 * What each credit card currently owes. Nothing is tagged by hand: any expense paid with a credit card adds to that
 * card's bill, and a card bill payment (a transfer) takes it down. A payment goes to the card whose last digits match,
 * else the card with the most due, since the SMS names the account the money left, not the card.
 */
export function cardBills(expenses: Expense[], youId: string): CardBill[] {
  const cards = new Map<string, CardBill>();
  const card = (e: Expense) => {
    const key = e.account ? `${e.bank ?? ''}|${e.account}` : 'card';
    if (!cards.has(key)) cards.set(key, { key, bank: e.account ? e.bank ?? null : null, account: e.account ?? null, due: 0, charges: [], lastPaid: null });
    return cards.get(key)!;
  };
  const sorted = expenses.filter((e) => !e.income).sort((a, b) => a.at.localeCompare(b.at));
  for (const e of sorted) {
    if (e.transfer) {
      const target = (e.account && cards.get(`${e.bank ?? ''}|${e.account}`)) || [...cards.values()].sort((a, b) => b.due - a.due)[0];
      if (!target) continue;
      target.due = round2(Math.max(0, target.due - e.amount));
      target.lastPaid = e.at;
      if (target.due < 0.5) target.charges = [];
      continue;
    }
    if (e.rail !== 'credit') continue;
    // A bill a friend paid on their own card is not on yours.
    if (e.groupId && e.payerId && e.payerId !== youId) continue;
    const c = card(e);
    c.due = round2(c.due + e.amount);
    c.charges.unshift(e);
  }
  return [...cards.values()].filter((c) => c.due >= 0.5).sort((a, b) => b.due - a.due);
}

export function remainingOwed(expenses: Expense[], settlements: Settlement[]) {
  const rem: Record<string, Record<string, number>> = {};
  const groupIds = [...new Set(expenses.map((e) => e.groupId).filter((id): id is string => !!id))];
  for (const gid of groupIds) {
    const exps = expenses
      .filter((e) => e.groupId === gid && e.shares && e.payerId)
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const e of exps) {
      rem[e.id] = {};
      for (const [id, share] of Object.entries(e.shares!)) {
        if (id !== e.payerId) rem[e.id][id] = share;
      }
    }
    const sets = settlements.filter((s) => s.groupId === gid).sort((a, b) => a.at.localeCompare(b.at));
    for (const s of sets) {
      let left = s.amount;
      for (const e of exps) {
        if (e.payerId !== s.toId) continue;
        const due = rem[e.id][s.fromId] || 0;
        const pay = Math.min(due, left);
        rem[e.id][s.fromId] = round2(due - pay);
        left = round2(left - pay);
        if (left < 0.5) break;
      }
    }
  }
  return rem;
}

export function owedBack(e: Expense, youId: string, rem: Record<string, Record<string, number>>) {
  if (e.payerId !== youId || !e.groupId) return 0;
  return round2(Object.values(rem[e.id] || {}).reduce((a, b) => a + b, 0));
}

export function youStillOwe(e: Expense, youId: string, rem: Record<string, Record<string, number>>) {
  if (!e.groupId || e.payerId === youId) return 0;
  return round2(rem[e.id]?.[youId] || 0);
}

// What this expense adds to your own spend: the whole amount for a personal expense, only your share for a split.
// Money you paid on someone else's behalf is not spend. It shows up as "coming back" instead.
export function pocket(e: Expense, youId: string) {
  if (e.income || e.transfer) return 0;
  if (!e.groupId) return e.amount;
  if (!e.reflect) return 0;
  return e.shares?.[youId] ?? 0;
}

export function countsAsSpend(e: Expense) {
  return !e.income && !e.transfer;
}

export function inRange(iso: string, from: string, to: string) {
  const k = dayKey(iso);
  return k >= from && k <= to;
}

export function monthBounds(y: number, m: number) {
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

// Your own spend in a range: personal expenses in full, split expenses at your share only.
// `back` is what friends still owe you on splits you paid for. It is not spend, so it is kept apart.
export function spendIn(expenses: Expense[], settlements: Settlement[], youId: string, from: string, to: string) {
  const rem = remainingOwed(expenses, settlements);
  let total = 0;
  let back = 0;
  let count = 0;
  const byDay: Record<string, { total: number; count: number }> = {};
  const byTag: Record<string, number> = {};
  const byMerchant: Record<string, { n: number; v: number }> = {};
  for (const e of expenses) {
    if (!countsAsSpend(e)) continue;
    if (!inRange(e.at, from, to)) continue;
    if (e.groupId && e.reflect) back += owedBack(e, youId, rem);
    const amount = pocket(e, youId);
    if (amount <= 0) continue;
    total += amount;
    count += 1;
    const key = dayKey(e.at);
    const day = byDay[key] ?? { total: 0, count: 0 };
    day.total += amount;
    day.count += 1;
    byDay[key] = day;
    const tag = e.tag || 'untagged';
    byTag[tag] = (byTag[tag] || 0) + amount;
    const merch = byMerchant[e.merchant] ?? { n: 0, v: 0 };
    merch.n += 1;
    merch.v += amount;
    byMerchant[e.merchant] = merch;
  }
  return { total: round2(total), back: round2(back), count, byDay, byTag, byMerchant };
}

export type Moved = { at: string; e: Expense } | { at: string; s: Settlement };

/**
 * Your spend for Insights. Same rule as spendIn: only your share counts. `owed` is what is still coming back
 * to you on bills you paid in the range. Settle-ups are listed in `items` but never change the spend.
 */
export function cashFlow(expenses: Expense[], settlements: Settlement[], youId: string, from: string, to: string) {
  const rem = remainingOwed(expenses, settlements);
  let spent = 0;
  let owed = 0;
  let recurring = 0;
  let count = 0;
  const items: Moved[] = [];
  const byDay: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  const byMerchant: Record<string, { n: number; v: number }> = {};
  for (const e of expenses) {
    if (!inRange(e.at, from, to) || (e.groupId && !e.reflect)) continue;
    items.push({ at: e.at, e });
    if (!countsAsSpend(e)) continue;
    owed += owedBack(e, youId, rem);
    const v = pocket(e, youId);
    if (v <= 0) continue;
    spent += v;
    count += 1;
    byDay[dayKey(e.at)] = (byDay[dayKey(e.at)] || 0) + v;
    if (e.recurring) recurring += v;
    const tag = e.tag || 'untagged';
    byTag[tag] = (byTag[tag] || 0) + v;
    const merch = byMerchant[e.merchant] ?? { n: 0, v: 0 };
    merch.n += 1;
    merch.v += v;
    byMerchant[e.merchant] = merch;
  }
  for (const s of settlements) {
    if (!inRange(s.at, from, to) || (s.fromId !== youId && s.toId !== youId)) continue;
    items.push({ at: s.at, s });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  return {
    spent: round2(spent),
    owed: round2(owed),
    recurring: round2(recurring),
    count,
    items,
    byDay,
    byTag,
    byMerchant,
  };
}

export function groupTotals(expenses: Expense[], group: Group, youId: string) {
  const ids = [youId, ...group.memberIds];
  const paid: Record<string, number> = {};
  const share: Record<string, number> = {};
  ids.forEach((id) => {
    paid[id] = 0;
    share[id] = 0;
  });
  let total = 0;
  for (const e of expenses) {
    if (e.groupId !== group.id || !e.shares || !e.payerId) continue;
    total += e.amount;
    paid[e.payerId] = round2((paid[e.payerId] || 0) + e.amount);
    for (const [id, v] of Object.entries(e.shares)) share[id] = round2((share[id] || 0) + v);
  }
  return {
    total: round2(total),
    rows: ids.map((id) => ({
      id,
      paid: paid[id] || 0,
      share: share[id] || 0,
      net: round2((paid[id] || 0) - (share[id] || 0)),
    })),
  };
}

export function percentShares(amount: number, pct: Record<string, number>) {
  const ids = Object.keys(pct).filter((id) => pct[id] > 0);
  const shares: Record<string, number> = {};
  let used = 0;
  ids.forEach((id, i) => {
    const v = i === ids.length - 1 ? round2(amount - used) : round2((amount * pct[id]) / 100);
    shares[id] = v;
    used = round2(used + v);
  });
  return shares;
}

// Ids are derived from the series and date so two devices posting the same repeat agree on one row.
export function dueRecurring(expenses: Expense[], now = new Date()) {
  const latest = new Map<string, Expense>();
  for (const e of expenses) {
    if (!e.recurId || e.groupId) continue;
    const prev = latest.get(e.recurId);
    if (!prev || prev.at < e.at) latest.set(e.recurId, e);
  }
  const ids = new Set(expenses.map((e) => e.id));
  const out: Expense[] = [];
  for (const e of latest.values()) {
    if (!e.recurring) continue;
    const start = new Date(e.at);
    for (let n = 1; n <= 60; n += 1) {
      const y = start.getFullYear();
      const m = start.getMonth() + n;
      const due = e.recurring === 'monthly'
        ? new Date(y, m, Math.min(start.getDate(), new Date(y, m + 1, 0).getDate()), 12)
        : new Date(y, start.getMonth(), start.getDate() + 7 * n, 12);
      if (due > now) break;
      const at = localNoon(due.getFullYear(), due.getMonth() + 1, due.getDate());
      const id = `${e.recurId}-${dayKey(at).replace(/-/g, '')}`;
      if (!ids.has(id)) out.push({ ...e, id, at, sample: e.sample });
    }
  }
  return out;
}

export function accountsFrom(expenses: Expense[]) {
  const map = new Map<string, { bank: string; account: string; count: number; credit: boolean }>();
  for (const e of expenses) {
    if (!e.account) continue;
    const key = `${e.bank ?? ''}|${e.account}`;
    const row = map.get(key) ?? { bank: e.bank ?? 'Bank', account: e.account, count: 0, credit: false };
    row.count += 1;
    if (e.rail === 'credit') row.credit = true;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function personName(people: Person[], you: Person, id: string) {
  if (id === you.id) return 'You';
  return people.find((p) => p.id === id)?.name ?? 'Someone';
}
