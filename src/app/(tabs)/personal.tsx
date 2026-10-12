import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buzz, Icon, Press, TxnRow, Word, usePalette } from '@/components/ui';
import { dayKey, inr, prettyDay } from '@/lib/format';
import { cardBills, monthBounds, pocket, spendIn, youBalances } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';
import type { Expense } from '@/lib/types';

const OPEN_BY_DEFAULT = 3;

export default function Personal() {
  const c = usePalette();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const now = new Date();
  const bounds = monthBounds(now.getFullYear(), now.getMonth() + 1);
  const month = spendIn(store.expenses, store.settlements, store.you.id, bounds.from, bounds.to);
  // Same numbers as the Home cards, so the two never disagree. Tap one to see who and which group.
  const { owedTotal: owed, oweTotal: owe } = youBalances(store.expenses, store.settlements, store.groups, store.you.id);
  const cards = cardBills(store.expenses, store.you.id);
  const cardDue = cards.reduce((a, b) => a + b.due, 0);
  const rows = [...store.expenses]
    .filter((e) => !e.groupId || e.reflect)
    .sort((a, b) => b.at.localeCompare(a.at));

  const days: { key: string; at: string; items: Expense[]; out: number; in: number }[] = [];
  for (const e of rows) {
    const key = dayKey(e.at);
    if (days[days.length - 1]?.key !== key) days.push({ key, at: e.at, items: [], out: 0, in: 0 });
    const d = days[days.length - 1];
    d.items.push(e);
    if (e.income) d.in += e.amount;
    else d.out += pocket(e, store.you.id);
  }

  // Day headers are direct ScrollView children so they can stick; index 0 is the title block.
  const sticky: number[] = [];
  const list: ReactNode[] = [];
  days.forEach((d, i) => {
    const open = toggled[d.key] ?? i < OPEN_BY_DEFAULT;
    sticky.push(list.length + 1);
    list.push(
      <View key={d.key} style={{ backgroundColor: c.bg, borderBottomWidth: open ? 0 : 1, borderBottomColor: c.faint }}>
        <Press
          onPress={() => { buzz(); setToggled((t) => ({ ...t, [d.key]: !open })); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>{prettyDay(d.at)}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 1 }}>
              {d.items.length} {d.items.length === 1 ? 'entry' : 'entries'}{d.in ? `, +₹${inr(d.in)} in` : ''}
            </Text>
          </View>
          <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: c.fg }}>{d.out ? `₹${inr(d.out)}` : ''}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.mut} />
        </Press>
      </View>,
    );
    if (open) {
      list.push(
        <Animated.View key={`${d.key}-rows`} entering={reduce ? undefined : FadeIn.duration(180)} style={{ marginBottom: 8 }}>
          {d.items.map((e) => <TxnRow key={e.id} item={e} showDay={false} onRemove={() => store.removeExpense(e.id)} />)}
        </Animated.View>,
      );
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView stickyHeaderIndices={sticky} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 24, paddingBottom: 120 }}>
        <View>
          <Word size={28}>Personal</Word>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 12 }}>
            <Stat label="This month" value={inr(month.total)} color={c.fg} />
            <Stat label="Owed back" value={inr(owed)} color={owed > 0.005 ? c.pos : c.fg} onPress={() => router.push({ pathname: '/balances', params: { side: 'owed' } })} />
            <Stat label="You owe" value={inr(owe)} color={owe > 0.005 ? c.neg : c.fg} onPress={() => router.push({ pathname: '/balances', params: { side: 'owe' } })} />
          </View>
          {cards.length ? (
            <Press onPress={() => router.push('/card-bill')} style={{ marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: c.sub, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="credit-card-clock-outline" size={22} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }}>Credit card bill</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 1 }}>{cards.length === 1 ? 'Built from your card spends' : `${cards.length} cards`}</Text>
              </View>
              <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: c.fg }}>₹{inr(cardDue)}</Text>
              <Icon name="chevron-right" size={20} color={c.mut} />
            </Press>
          ) : null}
        </View>
        {rows.length === 0 ? (
          <Text style={{ marginTop: 40, fontFamily: font.body, color: c.mut, fontSize: 15 }}>No expenses yet. Add one, or confirm a bank SMS.</Text>
        ) : list}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, color, onPress }: { label: string; value: string; color: string; onPress?: () => void }) {
  const c = usePalette();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 11.5, color: c.mut }} numberOfLines={1}>{label}</Text>
        {onPress ? <Icon name="chevron-right" size={14} color={c.mut} /> : null}
      </View>
      <Text style={{ fontFamily: font.displaySm, fontSize: 17, color, marginTop: 4 }} numberOfLines={1}>₹{value}</Text>
    </>
  );
  const box = { flex: 1, padding: 12, borderRadius: 16, backgroundColor: c.sub } as const;
  return onPress ? <Press onPress={onPress} style={box}>{body}</Press> : <View style={box}>{body}</View>;
}
