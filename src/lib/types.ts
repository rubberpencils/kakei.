export type Rail = 'upi' | 'debit' | 'credit' | 'neft' | 'imps' | 'cash';

export type Person = {
  id: string;
  name: string;
  initials: string;
  claimed?: boolean;
};

export type Group = {
  id: string;
  name: string;
  icon: string;
  memberIds: string[];
  note: string;
  code?: string;
  owner?: boolean;
  sample?: boolean;
  simplify?: boolean;
  // 'split' is a quick split of one bill. It has no trip or flat context and shows under Splits, not Groups.
  kind?: 'group' | 'split';
};

export type Expense = {
  id: string;
  merchant: string;
  amount: number;
  at: string;
  tag: string | null;
  rail: Rail;
  income: boolean;
  transfer: boolean;
  recurring: 'weekly' | 'monthly' | null;
  recurId: string | null;
  groupId: string | null;
  payerId: string | null;
  shares: Record<string, number> | null;
  reflect: boolean;
  account?: string | null;
  bank?: string | null;
  note?: string;
  sample?: boolean;
};

export type Settlement = {
  id: string;
  groupId: string;
  fromId: string;
  toId: string;
  amount: number;
  at: string;
  method: 'upi' | 'cash';
  sample?: boolean;
};

export type Draft = {
  id: string;
  key: string;
  sender: string;
  bank: string;
  body: string;
  at: string;
  amount: number;
  income: boolean;
  transfer: boolean;
  merchant: string;
  rail: Rail;
  tag: string | null;
  account: string | null;
  sample?: boolean;
};

export type MonthSnapshot = {
  y: number;
  m: number;
  spent: number;
  sample?: boolean;
};
