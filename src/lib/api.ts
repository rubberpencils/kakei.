import type { Expense, Group, MonthSnapshot, Settlement } from './types';

export const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? 'https://kakei.169.58.42.62.sslip.io';

export type Op =
  | { type: 'group.upsert'; group: Pick<Group, 'id' | 'name' | 'icon' | 'note'> & { sample?: boolean; simplify?: boolean; kind?: 'group' | 'split' } }
  | { type: 'group.delete'; id: string }
  | { type: 'person.add'; groupId: string; person: { id: string; name: string } }
  | { type: 'expense.upsert'; expense: Expense }
  | { type: 'expense.delete'; id: string }
  | { type: 'settlement.upsert'; settlement: Settlement }
  | { type: 'settlement.delete'; id: string }
  | { type: 'prefs.set'; prefs: { budget?: number; tags?: string[]; history?: MonthSnapshot[]; tagBudgets?: Record<string, number> } }
  | { type: 'me.set'; name?: string }
  // Asks the server to forget personal data that older versions of the app uploaded.
  | { type: 'personal.purge' };

export type Queued = Op & { qid: string };

export type Remote = {
  you: { id: string; name: string; phone: string };
  people: { id: string; name: string; claimed: boolean }[];
  groups: (Omit<Group, 'memberIds'> & { memberIds: string[]; code: string; owner: boolean })[];
  expenses: Expense[];
  settlements: Settlement[];
  prefs: { budget?: number; tags?: string[]; history?: MonthSnapshot[] };
};

export type Invite = {
  group: { id: string; name: string; icon: string; note: string };
  joined: boolean;
  members: { id: string; name: string; claimable: boolean }[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function cleanBase(raw: string) {
  const t = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(t) ? t : `http://${t}`;
}

/** True when the app is pointed at the hosted Kakei server rather than one someone typed in. */
export function isOfficial(base: string) {
  return cleanBase(base).toLowerCase() === cleanBase(DEFAULT_API).toLowerCase();
}

/** What to call a server on screen. The hosted one is just "Official servers", with no address to read out. */
export function serverName(base: string) {
  return isOfficial(base) ? 'Official servers' : base.replace(/^https?:\/\//, '');
}

export async function call<T>(base: string, token: string | null, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${base}`);
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Server said ${res.status}`);
  return json as T;
}
