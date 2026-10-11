import { dayKey, pad } from './format';
import { friendBalances, groupDebts, inRange, monthBounds, personName, pocket, round2, spendIn } from './ledger';
import type { Expense, Group, Person, Settlement } from './types';

// A tiny read-only MCP server (Streamable HTTP, JSON-RPC, stateless). It answers from what is already on the phone.
// It never sees SMS text, account numbers or anything not listed in a tool result below.

export type McpData = {
  you: Person;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  budget: number;
  now?: Date;
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { status: number; body: string };

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(\d{2})$/;

const TOOLS = [
  {
    name: 'get_summary',
    description:
      'Spending for one month. "spent" counts only the user\'s own share of every bill, so money fronted for friends is not spend. "toGetBack" is what friends still owe the user on bills the user paid.',
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'YYYY-MM. Defaults to the current month.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_transactions',
    description: 'Transactions, newest first. "yourShare" is the part that counts as the user\'s spend. Max 200 rows.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        to: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        tag: { type: 'string', description: 'Only this tag, such as food or rent' },
        query: { type: 'string', description: 'Case-insensitive match on the merchant or description' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'spending_by_tag',
    description: 'The user\'s own spend grouped by tag over a date range, largest first.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD. Defaults to the first of this month.' },
        to: { type: 'string', description: 'YYYY-MM-DD. Defaults to the end of this month.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_groups',
    description: 'Groups and quick splits with their members and what the user owes or is owed in each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_balances',
    description: 'Net balance with each friend across all groups. Positive means they owe the user.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const bad = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function problem(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function day(v: unknown, fallback: string) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string' || !DAY.test(v)) throw new Error('Dates must look like 2026-10-31');
  return v;
}

function monthRange(now: Date, raw: unknown) {
  if (raw == null || raw === '') return { ...monthBounds(now.getFullYear(), now.getMonth() + 1), label: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
  const m = typeof raw === 'string' ? MONTH.exec(raw) : null;
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error('Month must look like 2026-10');
  return { ...monthBounds(Number(m[1]), Number(m[2])), label: raw as string };
}

function kindOf(e: Expense) {
  return e.income ? 'income' : e.transfer ? 'transfer' : 'expense';
}

function callTool(name: string, args: Record<string, unknown>, d: McpData) {
  const now = d.now ?? new Date();
  const you = d.you.id;
  const groupName = (id: string | null) => (id ? d.groups.find((g) => g.id === id)?.name ?? null : null);

  if (name === 'get_summary') {
    const r = monthRange(now, args.month);
    const s = spendIn(d.expenses, d.settlements, you, r.from, r.to);
    const tags = Object.entries(s.byTag)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, spent]) => ({ tag, spent: round2(spent) }));
    return text({
      month: r.label,
      currency: 'INR',
      budget: d.budget || null,
      spent: round2(s.total),
      budgetLeft: d.budget ? round2(d.budget - s.total) : null,
      toGetBack: round2(s.back),
      transactions: s.count,
      topTags: tags,
    });
  }

  if (name === 'list_transactions') {
    const from = day(args.from, '0000-01-01');
    const to = day(args.to, '9999-12-31');
    const tag = typeof args.tag === 'string' && args.tag ? args.tag.toLowerCase() : null;
    const query = typeof args.query === 'string' && args.query ? args.query.toLowerCase() : null;
    const limit = Math.min(200, Math.max(1, Number.isInteger(args.limit) ? (args.limit as number) : 50));
    const rows = d.expenses
      .filter((e) => inRange(e.at, from, to) && (!tag || e.tag === tag) && (!query || e.merchant.toLowerCase().includes(query)))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        date: dayKey(e.at),
        merchant: e.merchant,
        amount: e.amount,
        yourShare: round2(pocket(e, you)),
        tag: e.tag,
        type: kindOf(e),
        split: groupName(e.groupId),
        paidBy: e.groupId && e.payerId ? personName(d.people, d.you, e.payerId) : 'You',
      }));
    return text({ currency: 'INR', count: rows.length, transactions: rows });
  }

  if (name === 'spending_by_tag') {
    const m = monthRange(now, undefined);
    const from = day(args.from, m.from);
    const to = day(args.to, m.to);
    const s = spendIn(d.expenses, d.settlements, you, from, to);
    const tags = Object.entries(s.byTag)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, spent]) => ({ tag, spent: round2(spent) }));
    return text({ from, to, currency: 'INR', total: round2(s.total), tags });
  }

  if (name === 'list_groups') {
    return text({
      currency: 'INR',
      groups: d.groups.map((g) => {
        const debts = groupDebts(d.expenses, d.settlements, g);
        const owed = debts.filter((x) => x.toId === you).reduce((a, x) => a + x.amount, 0);
        const owe = debts.filter((x) => x.fromId === you).reduce((a, x) => a + x.amount, 0);
        return {
          id: g.id,
          name: g.name,
          kind: g.kind === 'split' ? 'quick split' : 'group',
          members: g.memberIds.map((id) => personName(d.people, d.you, id)),
          transactions: d.expenses.filter((e) => e.groupId === g.id).length,
          youAreOwed: round2(owed),
          youOwe: round2(owe),
        };
      }),
    });
  }

  if (name === 'get_balances') {
    const rows = friendBalances(d.expenses, d.settlements, d.groups, you)
      .filter((f) => Math.abs(f.net) >= 0.5)
      .map((f) => ({
        friend: personName(d.people, d.you, f.id),
        net: round2(f.net),
        meaning: f.net > 0 ? 'owes you' : 'you owe them',
      }));
    return text({ currency: 'INR', balances: rows });
  }

  return problem(`Unknown tool ${name}`);
}

function one(msg: Rpc, d: McpData) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return bad(msg?.id, -32600, 'Invalid request');
  const id = msg.id;
  // A message with no id is a notification. It gets no answer.
  if (id === undefined) return null;
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kakei', version: '1.0.0' },
        instructions:
          'Personal finance data from the Kakei app, served from the user\'s phone. Read-only. Amounts are in INR. "spent" counts only the user\'s own share of a bill.',
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      if (!TOOLS.some((t) => t.name === name)) return bad(id, -32602, `Unknown tool ${name || '(none)'}`);
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
      try {
        return ok(id, callTool(name, args, d));
      } catch (err) {
        return ok(id, problem(err instanceof Error ? err.message : 'Something went wrong'));
      }
    }
    default:
      return bad(id, -32601, `Method not found: ${msg.method}`);
  }
}

export function handleMcp(raw: string, data: McpData): Reply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 200, body: JSON.stringify(bad(null, -32700, 'Parse error')) };
  }
  if (Array.isArray(parsed)) {
    const out = parsed.map((m) => one(m as Rpc, data)).filter((r) => r !== null);
    return out.length ? { status: 200, body: JSON.stringify(out) } : { status: 202, body: '' };
  }
  const res = one(parsed as Rpc, data);
  return res ? { status: 200, body: JSON.stringify(res) } : { status: 202, body: '' };
}
