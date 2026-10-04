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
import { cleanVpa } from './upi';

const KEY = 'kakie.v2';

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
  outbox: Queued[];
  syncedAt: number | null;
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
  outbox: [],
  syncedAt: null,
};

type SmsIn = { sender: string; body: string; date: number };
type NewExpense = Omit<Expense, 'id' | 'sample'> & { sample?: boolean };
export type SyncState = 'idle' | 'syncing' | 'offline';

const person = (id: string, name: string, claimed?: boolean, vpa?: string | null): Person => ({ id, name, initials: initials(name), claimed, vpa });

// UPI IDs stay in memory only; the persisted cache is plain AsyncStorage.
const withoutVpa = (s: Local): Local => ({
  ...s,
  you: { ...s.you, vpa: undefined },
  people: s.people.map((p) => ({ ...p, vpa: undefined })),
  outbox: s.outbox.map((o) => (o.type === 'me.set' && o.vpa ? { ...o, vpa: undefined } : o)),
});

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
    case 'me.set':
      return { ...s, you: person(s.you.id, op.name ?? s.you.name, s.you.claimed, op.vpa === undefined ? s.you.vpa : op.vpa) };
  }
}

function enqueue(s: Local, ops: Op[]): Local {
  let next = s;
  for (const op of ops) next = applyOp(next, op);
  return { ...next, outbox: [...next.outbox, ...ops.map((op) => ({ ...op, qid: uid() }) as Queued)] };
}

function rebase(s: Local, r: Remote): Local {
  let next: Local = {
    ...s,
    you: person(r.you.id, r.you.name, undefined, r.you.vpa ?? null),
    phone: r.you.phone,
    people: r.people.map((p) => person(p.id, p.name, p.claimed, p.vpa ?? null)),
    groups: r.groups,
    expenses: r.expenses,
    settlements: r.settlements,
    tags: r.prefs.tags ?? s.tags,
    budget: r.prefs.budget ?? 0,
    history: r.prefs.history ?? [],
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
  signedIn: boolean;
  toast: string;
  sync: SyncState;
  pending: number;
  hasSample: boolean;
  flash: (m: string) => void;
  setBase: (raw: string) => Promise<string | null>;
  signUp: (name: string, phone: string, password: string, vpa?: string) => Promise<string | null>;
  signIn: (phone: string, password: string) => Promise<string | null>;
  signOut: () => void;
  syncNow: () => Promise<void>;
  setSmsOn: (on: boolean) => void;
  setName: (name: string) => void;
  setVpa: (raw: string) => string | null;
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
  updateGroup: (id: string, patch: Partial<Pick<Group, 'name' | 'icon' | 'note' | 'simplify'>>) => void;
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
        if (raw) setS({ ...FRESH, ...(JSON.parse(raw) as Partial<Local>) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(withoutVpa(s))).catch(() => {});
  }, [s, ready]);

  const api = useMemo<Store>(() => {
    const flash = (m: string) => {
      setToast(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(''), 2400);
    };
    const commit = (ops: Op[]) => setS((x) => enqueue(x, ops));
    const signOutLocal = () => setS((x) => ({ ...FRESH, base: x.base }));

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
        const sent = cur.current.outbox;
        if (sent.length) {
          const res = await call<{ results: { ok: boolean; error?: string }[] }>(base, token, 'POST', '/ops', {
            ops: sent.map(({ qid: _qid, ...op }) => op),
          });
          const bad = res.results.find((r) => !r.ok);
          if (bad?.error) flash(bad.error);
          const done = new Set(sent.map((o) => o.qid));
          setS((x) => ({ ...x, outbox: x.outbox.filter((o) => !done.has(o.qid)) }));
          cur.current = { ...cur.current, outbox: cur.current.outbox.filter((o) => !done.has(o.qid)) };
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
      signUp: (name, phone, password, vpa) => authed('/auth/signup', { name, phone, password, ...(vpa ? { vpa } : {}) }),
      signIn: (phone, password) => authed('/auth/login', { phone, password }),
      signOut: () => {
        const { base, token } = cur.current;
        if (token) call(base, token, 'POST', '/auth/logout').catch(() => {});
        signOutLocal();
      },
      setSmsOn: (smsOn) => setS((x) => ({ ...x, smsOn })),
      setName: (name) => {
        const n = name.trim();
        if (n && n !== cur.current.you.name) commit([{ type: 'me.set', name: n }]);
      },
      setVpa: (raw) => {
        const vpa = raw.trim() ? cleanVpa(raw) : null;
        if (raw.trim() && !vpa) return 'Enter a UPI ID like name@bank';
        commit([{ type: 'me.set', vpa }]);
        flash(vpa ? 'UPI ID saved' : 'UPI ID removed');
        return null;
      },
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
        const ops: Op[] = [{ type: 'group.upsert', group: { id, name: name.trim() || 'Group', icon, note: '' } }];
        for (const raw of memberNames) {
          const n = raw.trim();
          if (n) ops.push({ type: 'person.add', groupId: id, person: { id: uid(), name: n } });
        }
        commit(ops);
        return id;
      },
      updateGroup: (id, patch) => {
        const g = cur.current.groups.find((x) => x.id === id);
        if (!g) return;
        const next = { ...g, ...patch };
        commit([{ type: 'group.upsert', group: { id, name: next.name.trim() || g.name, icon: next.icon, note: next.note, simplify: next.simplify !== false } }]);
      },
      addMember: (groupId, name) => {
        const n = name.trim();
        if (n) commit([{ type: 'person.add', groupId, person: { id: uid(), name: n } }]);
      },
      deleteGroup: (id) => commit([{ type: 'group.delete', id }]),
      previewInvite: async (code) => {
        const { base, token } = cur.current;
        try {
          return await call<Invite>(base, token, 'GET', `/invite/${encodeURIComponent(code.trim().toUpperCase())}`);
        } catch (err) {
          return err instanceof Error ? err.message : 'Could not open that invite';
        }
      },
      joinGroup: async (code, claimId) => {
        const { base, token } = cur.current;
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
          ops.push({ type: 'group.upsert', group: { id: g.id, name: g.name, icon: g.icon, note: g.note, sample: true } });
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
    if (!ready || !s.token) return;
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
  }, [ready, s.token]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
