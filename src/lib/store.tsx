import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError, call, cleanBase, DEFAULT_API, type Invite, type Op, type Queued, type Remote } from './api';
import { initials, localNoon, slugTag, uid } from './format';
import { dueRecurring, equalShares } from './ledger';
import { parseSms } from './parser';
import { sampleData, TAGS } from './seed';
import { readDeviceSms } from './sms';
import type { Draft, Expense, Group, MonthSnapshot, Person, Settlement } from './types';

const KEY = 'kakie.v2';

// Developer options. They live only on this phone and are never synced.
export type DevSettings = { mcp: boolean; lan: boolean; port: number; token: string };

type Local = {
  base: string;
  token: string | null;
  you: Person;
  phone: string;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  tags: string[];
  budget: number;
  history: MonthSnapshot[];
  queue: Draft[];
  seen: string[];
  smsOn: boolean;
  dev: DevSettings;
  // Local mode: no account, no server. Everything lives on this phone.
  local: boolean;
  // True while a local user is on the account screen to start syncing.
  connecting: boolean;
  outbox: Queued[];
  syncedAt: number | null;
  // Older versions uploaded personal spends. Set once the server has been asked to forget them.
  cleaned: boolean;
};

const NOBODY: Person = { id: 'me', name: 'You', initials: 'YO' };

const FRESH: Local = {
  base: DEFAULT_API,
  token: null,
  you: NOBODY,
  phone: '',
  people: [],
  groups: [],
  expenses: [],
  settlements: [],
  tags: TAGS,
  budget: 0,
  history: [],
  queue: [],
  seen: [],
  smsOn: false,
  dev: { mcp: false, lan: false, port: 8765, token: '' },
  local: false,
  connecting: false,
  outbox: [],
  syncedAt: null,
  cleaned: false,
};

type SmsIn = { sender: string; body: string; date: number };
type NewExpense = Omit<Expense, 'id' | 'sample'> & { sample?: boolean };
export type SyncState = 'idle' | 'syncing' | 'offline';

const person = (id: string, name: string, claimed?: boolean): Person => ({ id, name, initials: initials(name), claimed });

function applyOp(s: Local, op: Op): Local {
  switch (op.type) {
    case 'group.upsert': {
      const found = s.groups.some((g) => g.id === op.group.id);
      return {
        ...s,
        groups: found
          ? s.groups.map((g) => (g.id === op.group.id ? { ...g, ...op.group } : g))
          : [{ ...op.group, memberIds: [], owner: true }, ...s.groups],
      };
    }
    case 'group.delete':
      return {
        ...s,
        groups: s.groups.filter((g) => g.id !== op.id),
        expenses: s.expenses.filter((e) => e.groupId !== op.id),
        settlements: s.settlements.filter((x) => x.groupId !== op.id),
      };
    case 'person.add':
      return {
        ...s,
        people: s.people.some((p) => p.id === op.person.id) ? s.people : [...s.people, person(op.person.id, op.person.name)],
        groups: s.groups.map((g) =>
          g.id === op.groupId && !g.memberIds.includes(op.person.id) ? { ...g, memberIds: [...g.memberIds, op.person.id] } : g,
        ),
      };
    case 'expense.upsert':
      return {
        ...s,
        expenses: s.expenses.some((e) => e.id === op.expense.id)
          ? s.expenses.map((e) => (e.id === op.expense.id ? op.expense : e))
          : [op.expense, ...s.expenses],
      };
    case 'expense.delete':
      return { ...s, expenses: s.expenses.filter((e) => e.id !== op.id) };
    case 'settlement.upsert':
      return {
        ...s,
        settlements: s.settlements.some((x) => x.id === op.settlement.id)
          ? s.settlements.map((x) => (x.id === op.settlement.id ? op.settlement : x))
          : [op.settlement, ...s.settlements],
      };
    case 'settlement.delete':
      return { ...s, settlements: s.settlements.filter((x) => x.id !== op.id) };
    case 'prefs.set':
      return {
        ...s,
        budget: op.prefs.budget ?? s.budget,
        tags: op.prefs.tags ?? s.tags,
        history: op.prefs.history ?? s.history,
      };
    case 'personal.purge':
      return s;
    case 'me.set':
      return { ...s, you: person(s.you.id, op.name ?? s.you.name, s.you.claimed) };
  }
}

/**
 * Only what a group needs goes to the server: groups, their people, group expenses and settlements, and your name.
 * Personal spends, budget, tags and history never leave the phone. Pass the state from before the change, so a delete
 * can tell whether the expense it removes was shared.
 */
function isShared(before: Local, op: Op): boolean {
  switch (op.type) {
    case 'expense.upsert':
      return !!op.expense.groupId;
    case 'expense.delete':
      return !!before.expenses.find((e) => e.id === op.id)?.groupId;
    case 'prefs.set':
    case 'personal.purge':
      return false;
    default:
      return true;
  }
}

// What the server is sent. Which of your accounts paid stays with you.
function scrub(op: Op): Op {
  return op.type === 'expense.upsert' ? { ...op, expense: { ...op.expense, account: null, bank: null } } : op;
}

function enqueue(s: Local, ops: Op[]): Local {
  let next = s;
  for (const op of ops) next = applyOp(next, op);
  // Without an account there is nothing to send to.
  if (!next.token) return next;
  const shared = ops.filter((op) => isShared(s, op));
  if (!shared.length) return next;
  return { ...next, outbox: [...next.outbox, ...shared.map((op) => ({ ...op, qid: uid() }) as Queued)] };
}

// Local data gets the server's id for "you" when an account is made, so the bills you paid stay yours.
function remapYou(s: Local, to: string): Local {
  const from = s.you.id;
  if (from === to) return s;
  const swap = (id: string) => (id === from ? to : id);
  return {
    ...s,
    expenses: s.expenses.map((e) => ({
      ...e,
      payerId: e.payerId ? swap(e.payerId) : e.payerId,
      shares: e.shares ? Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [swap(k), v])) : e.shares,
    })),
    settlements: s.settlements.map((x) => ({ ...x, fromId: swap(x.fromId), toId: swap(x.toId) })),
  };
}

const isLocalHost = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/i.test(url);

// Everything on the phone, as ops, so a new account starts with what you already have.
function snapshotOps(s: Local): Op[] {
  const ops: Op[] = [];
  for (const g of s.groups) {
    ops.push({ type: 'group.upsert', group: { id: g.id, name: g.name, icon: g.icon, note: g.note, kind: g.kind ?? 'group', simplify: g.simplify !== false, sample: g.sample } });
    for (const pid of g.memberIds) {
      const p = s.people.find((x) => x.id === pid);
      if (p) ops.push({ type: 'person.add', groupId: g.id, person: { id: p.id, name: p.name } });
    }
  }
  // Group expenses only. Personal spends, budget and tags stay on the phone.
  for (const expense of s.expenses) if (expense.groupId) ops.push({ type: 'expense.upsert', expense });
  for (const settlement of s.settlements) ops.push({ type: 'settlement.upsert', settlement });
  return ops;
}

// The server owns shared data. Your own spends, budget, tags and history are never taken from it, only kept.
function rebase(s: Local, r: Remote): Local {
  const mine = new Map(s.expenses.map((e) => [e.id, e]));
  // The server does not keep which account paid, so put back what this phone already knows.
  const shared = r.expenses
    .filter((e) => e.groupId)
    .map((e) => {
      const local = mine.get(e.id);
      return local?.account ? { ...e, account: local.account, bank: local.bank ?? null } : e;
    });
  let next: Local = {
    ...s,
    you: person(r.you.id, r.you.name),
    phone: r.you.phone,
    people: r.people.map((p) => person(p.id, p.name, p.claimed)),
    groups: r.groups,
    expenses: [...shared, ...s.expenses.filter((e) => !e.groupId)],
    settlements: r.settlements,
    syncedAt: Date.now(),
  };
  for (const op of s.outbox) next = applyOp(next, op);
  const due = dueRecurring(next.expenses);
  return due.length ? enqueue(next, due.map((expense) => ({ type: 'expense.upsert', expense }))) : next;
}

function draftFrom(sender: string, body: string, at: string, key: string): Draft | null {
  const parsed = parseSms(sender, body);
  if (!parsed) return null;
  return {
    id: uid(), key, sender, body,
    bank: parsed.bank,
    at: parsed.at ?? at,
    amount: parsed.amount,
    income: parsed.income,
    transfer: parsed.transfer,
    merchant: parsed.merchant,
    rail: parsed.rail,
    tag: parsed.tag,
    account: parsed.account,
  };
}

function addDrafts(s: Local, rows: SmsIn[]) {
  const seen = new Set(s.seen);
  const fresh: Draft[] = [];
  for (const row of rows) {
    const key = `${row.sender}|${row.date}|${row.body.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const d = new Date(row.date);
    const draft = draftFrom(row.sender, row.body, localNoon(d.getFullYear(), d.getMonth() + 1, d.getDate()), key);
    if (draft) fresh.push(draft);
  }
  return { next: { ...s, seen: [...seen].slice(-2000), queue: [...fresh, ...s.queue] }, added: fresh.length };
}

type Store = Omit<Local, 'outbox' | 'token' | 'seen'> & {
  ready: boolean;
  // signedIn: has an account on the server. entered: past onboarding, with or without an account.
  signedIn: boolean;
  entered: boolean;
  toast: string;
  sync: SyncState;
  pending: number;
  hasSample: boolean;
  flash: (m: string) => void;
  setBase: (raw: string) => Promise<string | null>;
  signUp: (name: string, phone: string, password: string) => Promise<string | null>;
  signIn: (phone: string, password: string) => Promise<string | null>;
  startLocal: (name: string) => void;
  connect: () => void;
  cancelConnect: () => void;
  signOut: () => void;
  syncNow: () => Promise<void>;
  setSmsOn: (on: boolean) => void;
  setName: (name: string) => void;
  setDev: (patch: Partial<DevSettings>) => void;
  setBudget: (n: number) => void;
  addTag: (raw: string) => string | null;
  addExpense: (e: NewExpense) => string;
  updateExpense: (e: Expense) => void;
  removeExpense: (id: string) => void;
  removeSettlement: (id: string) => void;
  confirmDraft: (id: string, opts: { tag: string | null; groupId?: string | null; reflect?: boolean; shares?: Record<string, number> | null; payerId?: string | null }) => void;
  ignoreDraft: (id: string) => void;
  skipDraft: (id: string) => void;
  settle: (s: Omit<Settlement, 'id' | 'sample'>) => void;
  createGroup: (name: string, memberNames: string[], icon?: string) => string;
  groupFromExpense: (expenseId: string, name: string, memberNames: string[], icon?: string) => string | null;
  payCardBill: (bank: string | null, account: string | null, amount: number) => void;
  updateGroup: (id: string, patch: Partial<Pick<Group, 'name' | 'icon' | 'note' | 'simplify'>>) => void;
  quickSplit: (o: {
    expenseId?: string;
    draftId?: string;
    amount?: number;
    name: string;
    people: { id: string; name: string }[];
    payerId: string;
    shares: Record<string, number>;
    tag?: string | null;
  }) => string;
  unsplit: (groupId: string) => void;
  addMember: (groupId: string, name: string) => void;
  deleteGroup: (id: string) => void;
  previewInvite: (code: string) => Promise<Invite | string>;
  joinGroup: (code: string, claimId: string | null) => Promise<{ groupId: string } | string>;
  ingest: (rows: SmsIn[]) => number;
  ingestText: (body: string, sender?: string) => boolean;
  loadSample: () => void;
  clearSample: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Local>(FRESH);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState('');
  const [sync, setSync] = useState<SyncState>('idle');
  const cur = useRef(s);
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cur.current = s;
  }, [s]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = { ...FRESH, ...(JSON.parse(raw) as Partial<Local>) };
        // An older build saved localhost as the server. Without an account there, move to the real server.
        if (!saved.token && isLocalHost(saved.base) && !isLocalHost(DEFAULT_API)) saved.base = DEFAULT_API;
        setS(saved);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  }, [s, ready]);

  const api = useMemo<Store>(() => {
    const flash = (m: string) => {
      setToast(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(''), 2400);
    };
    const commit = (ops: Op[]) => setS((x) => enqueue(x, ops));
    // Signing out only drops the shared side. Your own spends, budget and tags are on this phone and stay.
    const signOutLocal = () =>
      setS((x) => ({
        ...FRESH,
        base: x.base,
        queue: x.queue,
        seen: x.seen,
        smsOn: x.smsOn,
        dev: x.dev,
        tags: x.tags,
        budget: x.budget,
        history: x.history,
        expenses: x.expenses.filter((e) => !e.groupId),
        you: x.you,
        local: true,
      }));
    const eraseAll = () => setS((x) => ({ ...FRESH, base: x.base }));

    const syncNow = async () => {
      const { token, base } = cur.current;
      if (!token) return;
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      setSync('syncing');
      try {
        const queued = cur.current.outbox;
        // The server takes at most 500 ops a request. Moving a whole local ledger over can be more than that.
        for (let i = 0; i < queued.length; i += 400) {
          const sent = queued.slice(i, i + 400);
          const res = await call<{ results: { ok: boolean; error?: string }[] }>(base, token, 'POST', '/ops', {
            ops: sent.map(({ qid: _qid, ...op }) => scrub(op as Op)),
          });
          const bad = res.results.find((r) => !r.ok);
          if (bad?.error) flash(bad.error);
          const done = new Set(sent.map((o) => o.qid));
          setS((x) => ({ ...x, outbox: x.outbox.filter((o) => !done.has(o.qid)) }));
          cur.current = { ...cur.current, outbox: cur.current.outbox.filter((o) => !done.has(o.qid)) };
        }
        // Older versions uploaded personal spends. Once this phone holds its own copy, ask the server to forget them.
        if (!cur.current.cleaned && cur.current.expenses.some((e) => !e.groupId)) {
          await call(base, token, 'POST', '/ops', { ops: [{ type: 'personal.purge' }] });
          setS((x) => ({ ...x, cleaned: true }));
          cur.current = { ...cur.current, cleaned: true };
        }
        const remote = await call<Remote>(base, token, 'GET', '/sync');
        setS((x) => (x.token === token ? rebase(x, remote) : x));
        setSync('idle');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          signOutLocal();
          flash('Signed out. Log in again.');
        }
        setSync('offline');
      } finally {
        busy.current = false;
        if (again.current) {
          again.current = false;
          setTimeout(syncNow, 0);
        }
      }
    };

    const authed = async (path: string, body: Record<string, string>) => {
      const base = cur.current.base;
      try {
        const res = await call<{ token: string; you: Remote['you'] }>(base, null, 'POST', path, body);
        setS((x) => {
          if (x.local) {
            const mine = remapYou(x, res.you.id);
            const connected: Local = {
              ...mine, base, token: res.token, you: person(res.you.id, res.you.name), phone: res.you.phone,
              local: false, connecting: false, outbox: [],
            };
            return enqueue(connected, snapshotOps(connected));
          }
          const same = x.you.id === res.you.id;
          return {
            ...(same ? x : { ...FRESH, queue: x.queue, seen: x.seen, smsOn: x.smsOn }),
            base,
            token: res.token,
            you: person(res.you.id, res.you.name),
            phone: res.you.phone,
          };
        });
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Something went wrong';
      }
    };

    const confirmExpense = (expense: Expense) => commit([{ type: 'expense.upsert', expense }]);

    return {
      ...s,
      ready,
      signedIn: !!s.token,
      entered: !!s.token || (s.local && !s.connecting),
      toast,
      sync,
      pending: s.outbox.length,
      hasSample: s.groups.some((g) => g.sample) || s.expenses.some((e) => e.sample) || s.queue.some((q) => q.sample),
      flash,
      syncNow,
      setBase: async (raw) => {
        const base = cleanBase(raw);
        try {
          await call(base, null, 'GET', '/health');
        } catch (err) {
          return err instanceof Error ? err.message : 'Cannot reach that server';
        }
        setS((x) => ({ ...x, base }));
        cur.current = { ...cur.current, base };
        return null;
      },
      signUp: (name, phone, password) => authed('/auth/signup', { name, phone, password }),
      signIn: (phone, password) => authed('/auth/login', { phone, password }),
      startLocal: (name) =>
        setS((x) =>
          x.local
            ? { ...x, connecting: false }
            : { ...FRESH, base: x.base, queue: x.queue, seen: x.seen, smsOn: x.smsOn, dev: x.dev, you: person(uid(), name.trim() || 'You'), local: true },
        ),
      connect: () => setS((x) => (x.local ? { ...x, connecting: true } : x)),
      cancelConnect: () => setS((x) => ({ ...x, connecting: false })),
      signOut: () => {
        const { base, token } = cur.current;
        if (token) {
          call(base, token, 'POST', '/auth/logout').catch(() => {});
          signOutLocal();
        } else {
          eraseAll();
        }
      },
      setSmsOn: (smsOn) => setS((x) => ({ ...x, smsOn })),
      setName: (name) => {
        const n = name.trim();
        if (n && n !== cur.current.you.name) commit([{ type: 'me.set', name: n }]);
      },
      setDev: (patch) => setS((x) => ({ ...x, dev: { ...x.dev, ...patch } })),
      setBudget: (budget) => commit([{ type: 'prefs.set', prefs: { budget } }]),
      addTag: (raw) => {
        const tag = slugTag(raw);
        if (!tag) return null;
        if (!cur.current.tags.includes(tag)) commit([{ type: 'prefs.set', prefs: { tags: [...cur.current.tags, tag] } }]);
        return tag;
      },
      addExpense: (e) => {
        const id = uid();
        const ops: Op[] = [{ type: 'expense.upsert', expense: { ...e, id } }];
        if (e.tag && !cur.current.tags.includes(e.tag)) ops.push({ type: 'prefs.set', prefs: { tags: [...cur.current.tags, e.tag] } });
        commit(ops);
        flash(e.recurring ? `Saved. Repeats ${e.recurring}` : e.income ? 'Income saved' : 'Expense saved');
        return id;
      },
      updateExpense: confirmExpense,
      removeExpense: (id) => commit([{ type: 'expense.delete', id }]),
      removeSettlement: (id) => commit([{ type: 'settlement.delete', id }]),
      confirmDraft: (id, opts) => {
        const x = cur.current;
        const d = x.queue.find((q) => q.id === id);
        if (!d) return;
        const group = opts.groupId ? x.groups.find((g) => g.id === opts.groupId) : null;
        const members = group ? [x.you.id, ...group.memberIds] : [];
        const expense: Expense = {
          id: uid(),
          merchant: d.merchant,
          amount: d.amount,
          at: d.at,
          tag: opts.tag,
          rail: d.rail,
          income: d.income,
          transfer: d.transfer,
          recurring: null,
          recurId: null,
          groupId: group?.id ?? null,
          payerId: group ? (opts.payerId ?? x.you.id) : null,
          shares: group ? (opts.shares ?? equalShares(d.amount, members)) : null,
          reflect: group ? opts.reflect !== false : true,
          bank: d.bank,
          account: d.account,
          sample: d.sample,
        };
        const ops: Op[] = [{ type: 'expense.upsert', expense }];
        if (opts.tag && !x.tags.includes(opts.tag)) ops.push({ type: 'prefs.set', prefs: { tags: [...x.tags, opts.tag] } });
        setS((y) => ({ ...enqueue(y, ops), queue: y.queue.filter((q) => q.id !== id) }));
      },
      ignoreDraft: (id) => setS((x) => ({ ...x, queue: x.queue.filter((q) => q.id !== id) })),
      skipDraft: (id) => setS((x) => {
        const i = x.queue.findIndex((q) => q.id === id);
        if (i < 0) return x;
        const queue = [...x.queue];
        const [item] = queue.splice(i, 1);
        return { ...x, queue: [...queue, item] };
      }),
      settle: (row) => {
        commit([{ type: 'settlement.upsert', settlement: { ...row, id: uid() } }]);
        flash('Settlement recorded');
      },
      createGroup: (name, memberNames, icon = 'account-group') => {
        const id = uid();
        const ops: Op[] = [{ type: 'group.upsert', group: { id, name: name.trim() || 'Group', icon, note: '', kind: 'group' } }];
        for (const raw of memberNames) {
          const n = raw.trim();
          if (n) ops.push({ type: 'person.add', groupId: id, person: { id: uid(), name: n } });
        }
        commit(ops);
        return id;
      },
      groupFromExpense: (expenseId, name, memberNames, icon = 'account-group') => {
        const x = cur.current;
        const e = x.expenses.find((r) => r.id === expenseId);
        if (!e) return null;
        const id = uid();
        const ids: string[] = [];
        const ops: Op[] = [{ type: 'group.upsert', group: { id, name: name.trim() || e.merchant, icon, note: '', kind: 'group' } }];
        for (const raw of memberNames) {
          const n = raw.trim();
          if (!n) continue;
          const pid = uid();
          ids.push(pid);
          ops.push({ type: 'person.add', groupId: id, person: { id: pid, name: n } });
        }
        // The bill moves in as the first expense, paid by you and split equally. It can be edited after.
        ops.push({ type: 'expense.upsert', expense: { ...e, groupId: id, payerId: x.you.id, shares: equalShares(e.amount, [x.you.id, ...ids]), reflect: true } });
        commit(ops);
        return id;
      },
      payCardBill: (bank, account, amount) => {        if (amount <= 0) return;
        const id = uid();
        commit([{
          type: 'expense.upsert',
          expense: {
            id, merchant: `${bank ?? 'Credit'}${account ? ` ••${account}` : ''} card bill`, amount, at: new Date().toISOString(), tag: null, rail: 'upi',
            income: false, transfer: true, recurring: null, recurId: null, groupId: null, payerId: null, shares: null, reflect: true,
            ...(account ? { account, bank } : {}),
          },
        }]);
        flash('Card payment saved');
      },
      updateGroup: (id, patch) => {
        const g = cur.current.groups.find((x) => x.id === id);
        if (!g) return;
        const next = { ...g, ...patch };
        commit([{ type: 'group.upsert', group: { id, name: next.name.trim() || g.name, icon: next.icon, note: next.note, simplify: next.simplify !== false, kind: g.kind ?? 'group' } }]);
      },
      quickSplit: (o) => {
        const x = cur.current;
        let base: Expense | undefined;
        let dropDraft: string | null = null;
        if (o.expenseId) base = x.expenses.find((e) => e.id === o.expenseId);
        else if (o.draftId) {
          const d = x.queue.find((q) => q.id === o.draftId);
          if (d) {
            base = {
              id: uid(), merchant: d.merchant, amount: d.amount, at: d.at, tag: o.tag ?? null, rail: d.rail,
              income: d.income, transfer: d.transfer, recurring: null, recurId: null, groupId: null, payerId: null,
              shares: null, reflect: true, bank: d.bank, account: d.account, sample: d.sample,
            };
            dropDraft = d.id;
          }
        }
        if (!o.expenseId && !o.draftId && o.amount && o.amount > 0) {
          base = {
            id: uid(), merchant: o.name.trim() || 'Split', amount: o.amount, at: new Date().toISOString(), tag: o.tag ?? null, rail: 'upi',
            income: false, transfer: false, recurring: null, recurId: null, groupId: null, payerId: null, shares: null, reflect: true,
          };
        }
        if (!base) return '';
        const groupId = uid();
        const ops: Op[] = [{ type: 'group.upsert', group: { id: groupId, name: o.name.trim() || base.merchant, icon: 'call-split', note: '', kind: 'split' } }];
        for (const p of o.people) if (p.id !== x.you.id) ops.push({ type: 'person.add', groupId, person: { id: p.id, name: p.name } });
        ops.push({ type: 'expense.upsert', expense: { ...base, groupId, payerId: o.payerId, shares: o.shares, reflect: true } });
        const tag = o.tag ?? base.tag;
        if (tag && !x.tags.includes(tag)) ops.push({ type: 'prefs.set', prefs: { tags: [...x.tags, tag] } });
        setS((y) => ({ ...enqueue(y, ops), queue: dropDraft ? y.queue.filter((q) => q.id !== dropDraft) : y.queue }));
        return groupId;
      },
      unsplit: (groupId) => {
        const x = cur.current;
        // Bills you paid go back to being plain expenses. Bills a friend paid belong to the split and go with it.
        const ops: Op[] = x.expenses
          .filter((e) => e.groupId === groupId && e.payerId === x.you.id)
          .map((e) => ({ type: 'expense.upsert', expense: { ...e, groupId: null, payerId: null, shares: null, reflect: true } }) as Op);
        ops.push({ type: 'group.delete', id: groupId });
        commit(ops);
      },
      addMember: (groupId, name) => {
        const n = name.trim();
        if (n) commit([{ type: 'person.add', groupId, person: { id: uid(), name: n } }]);
      },
      deleteGroup: (id) => commit([{ type: 'group.delete', id }]),
      previewInvite: async (code) => {
        const { base, token } = cur.current;
        if (!token) return 'Joining a group needs sync. Turn it on in Profile, then try again.';
        try {
          return await call<Invite>(base, token, 'GET', `/invite/${encodeURIComponent(code.trim().toUpperCase())}`);
        } catch (err) {
          return err instanceof Error ? err.message : 'Could not open that invite';
        }
      },
      joinGroup: async (code, claimId) => {
        const { base, token } = cur.current;
        if (!token) return 'Joining a group needs sync. Turn it on in Profile, then try again.';
        try {
          const res = await call<{ groupId: string }>(base, token, 'POST', '/join', { code: code.trim().toUpperCase(), claimId });
          await syncNow();
          return res;
        } catch (err) {
          return err instanceof Error ? err.message : 'Could not join';
        }
      },
      ingest: (rows) => {
        const { added } = addDrafts(cur.current, rows);
        setS((x) => ({ ...addDrafts(x, rows).next, smsOn: true }));
        return added;
      },
      ingestText: (body, sender = 'Shortcuts') => {
        const key = `text|${sender}|${body.slice(0, 80)}`;
        const x = cur.current;
        if (x.seen.includes(key)) return x.queue.some((q) => q.key === key);
        const draft = draftFrom(sender, body, new Date().toISOString(), key);
        setS((y) => ({ ...y, seen: [...y.seen, key], queue: draft ? [draft, ...y.queue] : y.queue }));
        return !!draft;
      },
      loadSample: () => {
        const x = cur.current;
        const data = sampleData(x.you.id);
        const ops: Op[] = [];
        for (const g of data.groups) {
          ops.push({ type: 'group.upsert', group: { id: g.id, name: g.name, icon: g.icon, note: g.note, sample: true, kind: g.kind ?? 'group' } });
          for (const pid of g.memberIds) {
            const p = data.people.find((q) => q.id === pid)!;
            ops.push({ type: 'person.add', groupId: g.id, person: { id: p.id, name: p.name } });
          }
        }
        for (const expense of data.expenses) ops.push({ type: 'expense.upsert', expense });
        for (const settlement of data.settlements) ops.push({ type: 'settlement.upsert', settlement });
        ops.push({ type: 'prefs.set', prefs: { history: [...x.history.filter((h) => !h.sample), ...data.history], ...(x.budget ? {} : { budget: data.budget }) } });
        setS((y) => ({ ...enqueue(y, ops), queue: [...y.queue.filter((q) => !q.sample), ...data.queue] }));
        flash('Sample data added');
      },
      clearSample: () => {
        const x = cur.current;
        const ops: Op[] = [
          ...x.groups.filter((g) => g.sample && g.owner).map((g) => ({ type: 'group.delete', id: g.id }) as Op),
          ...x.expenses.filter((e) => e.sample && !e.groupId).map((e) => ({ type: 'expense.delete', id: e.id }) as Op),
          { type: 'prefs.set', prefs: { history: x.history.filter((h) => !h.sample) } },
        ];
        setS((y) => ({ ...enqueue(y, ops), queue: y.queue.filter((q) => !q.sample) }));
        flash('Sample data cleared');
      },
    };
  }, [s, ready, toast, sync]);

  useEffect(() => {
    if (!ready || !s.token || !s.outbox.length) return;
    const t = setTimeout(() => api.syncNow(), 400);
    return () => clearTimeout(t);
  }, [ready, s.token, s.outbox, api]);

  useEffect(() => {
    if (!ready || !(s.token || (s.local && !s.connecting))) return;
    const scan = async () => {
      if (!cur.current.smsOn) return;
      const res = await readDeviceSms(80, true);
      if (res.rows.length) setS((x) => addDrafts(x, res.rows).next);
    };
    api.syncNow();
    scan();
    // ponytail: 20s polling, fine for small groups. Switch to server-sent events if group edits must feel instant.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') api.syncNow();
    }, 20000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      api.syncNow();
      scan();
    });
    return () => {
      clearInterval(poll);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.token, s.local, s.connecting]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
