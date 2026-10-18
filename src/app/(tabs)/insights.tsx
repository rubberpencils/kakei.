import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Input } from '@/components/input';
import { Press, Section, Segmented, SettleRow, TxnRow, Word, useDark, usePalette } from '@/components/ui';
import { SwipeShift } from '@/components/ui';
import { dayKey, inr, monthName, pad } from '@/lib/format';
import { cashFlow, detectSubs, monthBounds, personName } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font, tagColors } from '@/lib/theme';

type Range = 'month' | 'year' | 'custom';
type Unit = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;
const PER: Record<Unit, number> = { day: 1, week: 7, month: 365 / 12 };
const SAVE_GOAL = 0.2;
const BARS = 72;

export default function Insights() {
  const c = usePalette();
  const isDark = useDark();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const today = dayKey(now.toISOString());
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [range, setRange] = useState<Range>('month');
  const [filters, setFilters] = useState(false);
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(today);
  const [day, setDay] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>('day');
  const you = store.you.id;

  const bounds = range === 'year'
    ? { from: `${cursor.y}-01-01`, to: `${cursor.y}-12-31` }
    : range === 'custom'
      ? { from, to }
      : monthBounds(cursor.y, cursor.m);

  const flow = useMemo(
    () => cashFlow(store.expenses, store.settlements, you, bounds.from, bounds.to),
    [store.expenses, store.settlements, you, bounds.from, bounds.to],
  );

  const span = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS) + 1);
  const periodDays = span(bounds.from, bounds.to);
  const live = bounds.from <= today && today <= bounds.to;
  const elapsed = bounds.from > today ? 1 : span(bounds.from, live ? today : bounds.to);
  const perDay = (store.budget * 12) / 365;
  const budget = range === 'month' ? store.budget : perDay * periodDays;
  const label = range === 'year' ? String(cursor.y) : range === 'custom' ? `${from} to ${to}` : `${monthName(cursor.m)} ${cursor.y}`;

  const days = Object.entries(flow.byDay).filter(([, v]) => v > 0);
  const high = days.reduce<[string, number] | null>((a, d) => (!a || d[1] > a[1] ? d : a), null);
  const low = days.reduce<[string, number] | null>((a, d) => (!a || d[1] < a[1] ? d : a), null);
  const dayLabel = (k: string) => `${Number(k.slice(8))} ${monthName(Number(k.slice(5, 7)), true)}`;

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const nowFrom = unit === 'day' ? today : unit === 'week' ? dayKey(weekStart.toISOString()) : monthBounds(now.getFullYear(), now.getMonth() + 1).from;
  const soFar = cashFlow(store.expenses, store.settlements, you, nowFrom, today);
  const current = soFar.spent - soFar.recurring;
  // Everyday pace leaves recurring bills out: one rent day would otherwise put every average over.
  const everyday = Math.max(0, budget - flow.recurring) / periodDays;
  const average = ((flow.spent - flow.recurring) / elapsed) * PER[unit];
  const allowance = everyday * PER[unit];
  const daysOver = Object.values(flow.byDay).filter((v) => v > everyday).length;

  const tags = Object.entries(flow.byTag).sort((a, b) => b[1] - a[1]);
  const tagTotal = tags.reduce((a, [, v]) => a + v, 0) || 1;
  const merchants = Object.entries(flow.byMerchant).sort((a, b) => b[1].v - a[1].v).slice(0, 4);
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(cursor.y, cursor.m - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const b = monthBounds(y, m);
    const moved = cashFlow(store.expenses, store.settlements, you, b.from, b.to);
    const snap = store.history.find((h) => h.y === y && h.m === m);
    const spent = moved.count ? moved.spent : snap?.spent ?? moved.spent;
    months.push({ y, m, spent, save: Math.max(0, store.budget - spent) });
  }
  const maxBar = Math.max(...months.map((x) => x.spent), store.budget, 1);

  const cells = calendarCells(cursor.y, cursor.m);
  const dayItems = day ? flow.items.filter((x) => dayKey(x.at) === day) : [];
  const name = (pid: string) => personName(store.people, store.you, pid);

  const over = budget > 0 && flow.spent > budget;
  const scale = Math.max(budget, flow.spent + flow.owed, 1);
  const unspent = Math.max(0, budget - flow.spent);
  const goal = budget * SAVE_GOAL;
  const room = budget - goal - flow.spent;
  const daysLeft = periodDays - elapsed + 1;
  const safe = live && room > 0 ? room / daysLeft : 0;
  const oneTime = Math.max(0, flow.spent - flow.recurring);

  const shift = (dir: number) => {
    setDay(null);
    if (range === 'year') setCursor((s) => ({ ...s, y: s.y + dir }));
    else setCursor((s) => {
      const d = new Date(s.y, s.m - 1 + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };

  return (
    <SwipeShift onNext={() => range !== 'custom' && shift(1)} onPrev={() => range !== 'custom' && shift(-1)}>
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 120 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
        <Word size={28}>Insights</Word>
        <Press onPress={() => setFilters((v) => !v)}>
          <Text style={{ fontFamily: font.medium, color: c.mut, fontSize: 14 }}>{filters ? 'Done' : 'Filter'}</Text>
        </Press>
      </View>
      {filters ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 4 }}>
          {(['year', 'custom'] as Range[]).map((id) => {
            const on = range === id;
            return (
              <Press key={id} onPress={() => setRange(range === id ? 'month' : id)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.medium, color: on ? c.accFg : c.fg, fontSize: 13 }}>{id === 'year' ? 'Year' : 'Custom'}</Text>
              </Press>
            );
          })}
        </View>
      ) : null}
      {range === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 14, paddingHorizontal: 4 }}>
          <Field label="From" value={from} onChange={setFrom} />
          <Field label="To" value={to} onChange={setTo} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <Press onPress={() => shift(-1)} style={hit}><Text style={{ fontSize: 22, color: c.fg }}>‹</Text></Press>
          <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: c.fg }}>{label}</Text>
          <Press onPress={() => shift(1)} style={hit}><Text style={{ fontSize: 22, color: c.fg }}>›</Text></Press>
        </View>
      )}

      <Card style={{ marginTop: 10 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>Spent</Text>
        <Text style={{ fontFamily: font.display, fontSize: 40, letterSpacing: -1.2, color: c.fg, marginTop: 2 }}>₹{inr(flow.spent)}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 2 }}>
          {budget ? (over ? `₹${inr(flow.spent - budget)} over the ₹${inr(budget)} budget` : `${Math.round((unspent / budget) * 100)}% of ₹${inr(budget)} left`) : 'Set a monthly budget in Profile to track it here'}
        </Text>
        {range === 'month' && months.length >= 2 ? (
          <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4 }}>
            ₹{inr(Math.abs(flow.spent - months[months.length - 2].spent))} {flow.spent >= months[months.length - 2].spent ? 'more' : 'less'} than last month
          </Text>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <Meter parts={[{ pct: (flow.spent / scale) * 100, color: over ? c.neg : c.fg }, { pct: (flow.owed / scale) * 100, color: c.pos }]} mark={over ? (budget / scale) * 100 : undefined} />
        </View>
        <View style={{ marginTop: 14, gap: 8 }}>
          <Key color={over ? c.neg : c.fg} label="Your share" value={flow.spent} />
          <Key color={c.pos} label="Still coming back to you" value={flow.owed} />
          {budget ? <Key ring color={c.mut} label={over ? 'Over budget' : 'Left in budget'} value={over ? flow.spent - budget : unspent} /> : null}
        </View>
        {flow.owed ? (
          <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 12, lineHeight: 17 }}>
            Only your share counts as spend. The green part is money you paid for others and have not got back yet.
          </Text>
        ) : null}
      </Card>

      <Section title="Pace" top={28} />
      <Segmented<Unit> value={unit} onChange={setUnit} options={[{ id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }]} />
      <Card style={{ marginTop: 10, gap: 16 }}>
        {live ? <Pace label={unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month'} value={current} limit={allowance} /> : null}
        <Pace label={`Average ${unit}`} value={average} limit={allowance} />
        <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, lineHeight: 17 }}>
          {store.budget ? `Everyday spending, with rent and other recurring bills left out. After those, your budget allows ₹${inr(allowance)} a ${unit}.` : 'Set a monthly budget in Profile to see how much you can spend each day.'}
        </Text>
      </Card>

      {range === 'month' ? (
        <>
          <Section title="Calendar" top={28} />
          <Card>
            <View style={{ flexDirection: 'row' }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: font.medium, fontSize: 11, color: c.mut, marginBottom: 6 }}>{d}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((n, i) => {
                const key = n ? `${cursor.y}-${pad(cursor.m)}-${pad(n)}` : '';
                const v = n ? flow.byDay[key] ?? 0 : 0;
                const ratio = v / (everyday || (high?.[1] ?? 1));
                const on = day === key;
                return (
                  <View key={i} style={{ width: '14.28%', padding: 2.5 }}>
                    {n ? (
                      <Press onPress={() => setDay(on ? null : key)} style={{ height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: on ? c.acc : 'transparent', borderWidth: key === today && !on ? 1 : 0, borderColor: c.line }}>
                        {v > 0 && !on ? (
                          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: ratio > 1 ? c.neg : c.pos, opacity: ratio > 1 ? 0.3 + 0.3 * Math.min(1, ratio - 1) : 0.12 + 0.3 * ratio }} />
                        ) : null}
                        <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{n}</Text>
                      </Press>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 10, lineHeight: 17 }}>
              {everyday ? `Green days stayed under your everyday ₹${inr(everyday)}, red went over.` : 'Days are shaded by money out.'} Tap a day to see it.
            </Text>
          </Card>
          {day ? (
            <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
              {dayItems.length === 0
                ? <Text style={{ fontFamily: font.body, color: c.mut, paddingVertical: 12 }}>No money moved on this day.</Text>
                : dayItems.map((x) => ('e' in x ? <TxnRow key={x.e.id} item={x.e} full /> : <SettleRow key={x.s.id} s={x.s} you={you} name={name} />))}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        <Tile label="Lowest day" value={low ? `₹${inr(low[1])}` : 'None'} sub={low ? dayLabel(low[0]) : ''} />
        <Tile label="Highest day" value={high ? `₹${inr(high[1])}` : 'None'} sub={high ? dayLabel(high[0]) : ''} />
        <Tile label="Expenses" value={String(flow.count)} sub={`${days.length} ${days.length === 1 ? 'day' : 'days'} with spending`} />
        {everyday
          ? <Tile label="Days on budget" value={`${Math.max(0, elapsed - daysOver)} of ${elapsed}`} sub={`under ₹${inr(everyday)} a day`} />
          : <Tile label="Daily average" value={`₹${inr(flow.spent / elapsed)}`} sub={`over ${elapsed} ${elapsed === 1 ? 'day' : 'days'}`} />}
      </View>

      <Section title="Categories" top={28} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pie slices={tags.slice(0, 6).map(([tag, v]) => ({ tag, pct: (v / tagTotal) * 100 }))} track={c.bar} isDark={isDark} />
        <View style={{ flex: 1, gap: 8 }}>
          {tags.slice(0, 6).map(([tag, v]) => (
            <View key={tag} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tagColors(tag, isDark).pie }} />
              <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13, color: c.fg }} numberOfLines={1}>#{tag}</Text>
              <Text style={{ fontFamily: font.displaySm, fontSize: 12, color: c.mut }}>{Math.round((v / tagTotal) * 100)}%</Text>
            </View>
          ))}
          {tags.length === 0 ? <Text style={{ fontFamily: font.body, color: c.mut }}>Nothing spent in this range.</Text> : null}
        </View>
      </Card>

      <Section title="Savings" top={28} />
      <Card>
        {budget ? (
          <>
            <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>{live ? 'Safe to spend' : 'Saved'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <Text style={{ fontFamily: font.display, fontSize: 30, letterSpacing: -0.8, color: live && !safe ? c.neg : c.fg }}>₹{inr(live ? safe : unspent)}</Text>
              <Text style={{ fontFamily: font.semi, fontSize: 14, color: c.mut }}>{live ? 'a day' : `Savings rate ${Math.round((unspent / budget) * 100)}%`}</Text>
            </View>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 2 }}>
              {!live ? (unspent >= goal ? 'You hit the 20% savings goal.' : `₹${inr(goal - unspent)} short of the 20% goal.`)
                : safe ? `for the next ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to still save 20%`
                  : over ? 'Over budget, so nothing is left to save.' : `₹${inr(-room)} of the 20% savings is already spent.`}
            </Text>
            <View style={{ marginTop: 16 }}>
              <Meter zone={100 - SAVE_GOAL * 100} mark={100 - SAVE_GOAL * 100} parts={[{ pct: (flow.spent / budget) * 100, color: room < 0 ? c.neg : c.fg }]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>Spent ₹{inr(flow.spent)}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: c.pos }}>Save 20%, ₹{inr(goal)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: font.body, color: c.mut }}>Set a monthly budget in Profile to see savings.</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: BARS, marginTop: 22 }}>
          {months.map((mo) => (
            <View key={`${mo.y}-${mo.m}`} style={{ flex: 1, height: Math.max(4, (mo.spent / maxBar) * BARS), borderRadius: 6, backgroundColor: !store.budget ? c.bar : mo.save > 0 ? c.pos : c.neg }} />
          ))}
          {store.budget ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: (store.budget / maxBar) * BARS, height: 1, backgroundColor: c.fg, opacity: 0.35 }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {months.map((mo) => (
            <Text key={`${mo.y}-${mo.m}`} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: font.medium, color: c.mut }}>{monthName(mo.m, true)}</Text>
          ))}
        </View>
        {store.budget ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 8 }}>Last six months against your budget line.</Text> : null}
      </Card>

      {detectSubs(store.expenses).filter((sub) => !store.expenses.some((e) => e.merchant.toLowerCase() === sub.merchant.toLowerCase() && e.recurring === 'monthly')).length ? (
        <>
          <Section title="Looks like a subscription" top={28} />
          <Card style={{ gap: 10 }}>
            {detectSubs(store.expenses).filter((sub) => !store.expenses.some((e) => e.merchant.toLowerCase() === sub.merchant.toLowerCase() && e.recurring === 'monthly')).map((sub) => (
              <Press key={sub.merchant} onPress={() => store.markMonthly(sub.merchant)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontFamily: font.medium, color: c.fg }}>{sub.merchant}</Text>
                <Text style={{ fontFamily: font.mono, color: c.mut }}>₹{inr(sub.amount)}</Text>
              </Press>
            ))}
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>Tap one to mark it monthly.</Text>
          </Card>
        </>
      ) : null}

      <Section title="Recurring and one-time" top={28} />
      <Card style={{ gap: 12 }}>
        <Meter parts={[{ pct: flow.spent ? (flow.recurring / flow.spent) * 100 : 0, color: c.fg }, { pct: flow.spent ? (oneTime / flow.spent) * 100 : 0, color: c.mut }]} />
        <Key color={c.fg} label="Recurring" value={flow.recurring} pct={flow.spent ? flow.recurring / flow.spent : 0} />
        <Key color={c.mut} label="One-time" value={oneTime} pct={flow.spent ? oneTime / flow.spent : 0} />
      </Card>

      <Section title="Top merchants" top={28} />
      {merchants.map(([merchant, v], i) => (
        <View key={merchant} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: font.mono, width: 18, color: c.mut }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>{merchant}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>{v.n} {v.n === 1 ? 'time' : 'times'}</Text>
          </View>
          <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: c.fg }}>₹{inr(v.v)}</Text>
        </View>
      ))}
      {merchants.length === 0 ? <Text style={{ fontFamily: font.body, color: c.mut, paddingHorizontal: 4 }}>Nothing yet.</Text> : null}
    </ScrollView>
    </SwipeShift>
  );
}

function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = usePalette();
  return <View style={[{ backgroundColor: c.sub, borderRadius: 22, padding: 18 }, style]}>{children}</View>;
}

function Meter({ parts, mark, zone }: { parts: { pct: number; color: string }[]; mark?: number; zone?: number }) {
  const c = usePalette();
  return (
    <View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.bar, flexDirection: 'row', overflow: 'hidden' }}>
        {zone !== undefined ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${zone}%`, right: 0, backgroundColor: c.pos, opacity: 0.3 }} /> : null}
        {parts.map((p, i) => <View key={i} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, backgroundColor: p.color }} />)}
      </View>
      {mark !== undefined ? <View style={{ position: 'absolute', left: `${Math.min(100, mark)}%`, top: -3, width: 2, height: 16, borderRadius: 1, backgroundColor: c.fg }} /> : null}
    </View>
  );
}

function Key({ color, label, value, pct, ring }: { color: string; label: string; value: number; pct?: number; ring?: boolean }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, ...(ring ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color }) }} />
      <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13, color: c.mut }}>{label}</Text>
      <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.fg }}>₹{inr(value)}{pct !== undefined ? ` (${Math.round(pct * 100)}%)` : ''}</Text>
    </View>
  );
}

function Pace({ label, value, limit }: { label: string; value: number; limit: number }) {
  const c = usePalette();
  const over = limit > 0 && value > limit;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.mut }}>{label}</Text>
        <Text style={{ fontFamily: font.displaySm, fontSize: 16, color: over ? c.neg : c.fg }}>
          ₹{inr(value)}{limit > 0 ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}> of ₹{inr(limit)}</Text> : null}
        </Text>
      </View>
      <Meter parts={[{ pct: limit > 0 ? (value / limit) * 100 : 0, color: over ? c.neg : c.pos }]} />
    </View>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  const c = usePalette();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: c.sub, borderRadius: 18, padding: 14 }}>
      <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.mut }}>{label}</Text>
      <Text style={{ fontFamily: font.displaySm, fontSize: 19, color: c.fg, marginTop: 6 }} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ fontFamily: font.body, fontSize: 11.5, color: c.mut, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function calendarCells(y: number, m: number) {
  const first = new Date(y, m - 1, 1);
  const padN = (first.getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < padN; i += 1) cells.push(null);
  for (let d = 1; d <= count; d += 1) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Pie({ slices, track, isDark }: { slices: { tag: string; pct: number }[]; track: string; isDark: boolean }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const arcs = slices.reduce<{ tag: string; len: number; start: number }[]>((acc, s) => {
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].len : 0;
    return [...acc, { tag: s.tag, len: (s.pct / 100) * circ, start }];
  }, []);
  return (
    <Svg width={128} height={128} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={64} cy={64} r={r} stroke={track} strokeWidth={16} fill="none" />
      {arcs.map((s) => (
        <Circle
          key={s.tag}
          cx={64}
          cy={64}
          r={r}
          stroke={tagColors(s.tag, isDark).pie}
          strokeWidth={16}
          fill="none"
          strokeDasharray={`${s.len} ${circ - s.len}`}
          strokeDashoffset={-s.start}
        />
      ))}
    </Svg>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>{label}</Text>
      <Input value={value} onChangeText={onChange} label={label} caps="none" style={{ fontFamily: font.mono, fontSize: 13, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 6 }} />
    </View>
  );
}

const hit = { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const };
