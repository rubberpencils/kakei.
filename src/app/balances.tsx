import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Back, buzz, Icon, Press, usePalette, Word } from '@/components/ui';
import { inr } from '@/lib/format';
import { personName, youBalances } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

type Side = 'owed' | 'owe';

// Where the money you are owed comes from, or where the money you owe goes. Same numbers as the Home cards.
export default function Balances() {
  const { side: param } = useLocalSearchParams<{ side?: string }>();
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [side, setSide] = useState<Side>(param === 'owe' ? 'owe' : 'owed');

  const b = youBalances(store.expenses, store.settlements, store.groups, store.you.id);
  const rows = side === 'owed' ? b.owed : b.owe;
  const total = side === 'owed' ? b.owedTotal : b.oweTotal;
  const color = side === 'owed' ? c.pos : c.neg;
  const groupCount = new Set(rows.flatMap((r) => r.lines.map((l) => l.groupId))).size;
  const group = (id: string) => store.groups.find((g) => g.id === id);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }}>
      <Back />
      <Word size={28}>Balances</Word>

      <View style={{ flexDirection: 'row', backgroundColor: c.sub, borderRadius: 20, padding: 3, marginTop: 18 }}>
        {([['owed', 'Owed to you', b.owedTotal], ['owe', 'You owe', b.oweTotal]] as const).map(([k, label, amount]) => {
          const on = side === k;
          return (
            <Press key={k} onPress={() => { buzz(); setSide(k); }} style={{ flex: 1, height: 38, borderRadius: 17, backgroundColor: on ? c.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: on ? c.accFg : c.fg }}>{label}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 11, color: on ? c.accFg : c.mut, marginTop: 1 }}>₹{inr(amount)}</Text>
            </Press>
          );
        })}
      </View>

      <Text style={{ marginTop: 28, fontFamily: font.display, fontSize: 52, letterSpacing: -1.5, color: total > 0.005 ? color : c.fg }}>₹{inr(total)}</Text>
      <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 14, color: c.mut, lineHeight: 20 }}>
        {rows.length
          ? side === 'owed'
            ? `Coming back from ${rows.length} ${rows.length === 1 ? 'person' : 'people'} across ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}.`
            : `You owe ${rows.length} ${rows.length === 1 ? 'person' : 'people'} across ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}.`
          : side === 'owed' ? 'Nobody owes you anything right now.' : 'You do not owe anyone anything right now.'}
      </Text>

      {rows.map((r, i) => {
        const p = store.people.find((x) => x.id === r.id);
        const name = personName(store.people, store.you, r.id);
        const top = r.lines[0];
        return (
          <Animated.View key={`${side}-${r.id}`} entering={reduce ? undefined : FadeInDown.delay(Math.min(i, 6) * 40).duration(260)} style={{ marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Press onPress={() => router.push({ pathname: '/person/[id]', params: { id: r.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar id={r.id} label={p?.initials ?? name.slice(0, 1)} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }} numberOfLines={1}>{name}</Text>
                  <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 1 }}>
                    {r.lines.length} {r.lines.length === 1 ? 'group' : 'groups'}
                  </Text>
                </View>
                <Text style={{ fontFamily: font.displaySm, fontSize: 19, color }}>₹{inr(r.amount)}</Text>
              </Press>
            </View>
            <View style={{ marginTop: 10, marginLeft: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.faint }}>
              {r.lines.map((l) => {
                const g = group(l.groupId);
                return (
                  <Press key={l.groupId} onPress={() => router.push({ pathname: '/group/[id]', params: { id: l.groupId } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.faint }}>
                    <Icon name={g?.icon ?? 'account-group'} size={18} color={c.mut} />
                    <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 14.5, color: c.fg }} numberOfLines={1}>{g?.name ?? 'Group'}</Text>
                    <Text style={{ fontFamily: font.displaySm, fontSize: 14.5, color: c.fg }}>₹{inr(l.amount)}</Text>
                    <Icon name="chevron-right" size={18} color={c.mut} />
                  </Press>
                );
              })}
              {top ? (
                <Press onPress={() => router.push({ pathname: '/settle', params: { groupId: top.groupId, with: r.id } })} style={{ alignSelf: 'flex-start', marginTop: 10, height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.fg }}>{side === 'owed' ? 'Record a payment' : 'Settle up'}</Text>
                </Press>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}
