import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Icon, Press, Segmented, Word, usePalette } from '@/components/ui';
import { inr } from '@/lib/format';
import { friendBalances, groupDebts, personName, youNet } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

type Mode = 'groups' | 'friends';

export default function Groups() {
  const c = usePalette();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [view, setView] = useState<Mode>('groups');
  const you = store.you.id;
  const friends = friendBalances(store.expenses, store.settlements, store.groups, you);
  const owed = friends.reduce((s, f) => s + Math.max(0, f.net), 0);
  const owe = friends.reduce((s, f) => s + Math.max(0, -f.net), 0);
  const name = (pid: string) => personName(store.people, store.you, pid);
  const first = (pid: string) => name(pid).split(' ')[0];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Word size={28}>Groups</Word>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Press onPress={() => router.push('/join')} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 13 }}>Join with code</Text>
          </Press>
          <Press onPress={() => router.push('/new-group')} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={20} color={c.accFg} />
          </Press>
        </View>
      </View>

      {store.groups.length ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <Total label="Owed to you" amount={owed} color={owed ? c.pos : c.fg} />
          <Total label="You owe" amount={owe} color={owe ? c.neg : c.fg} />
        </View>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <Segmented<Mode> value={view} onChange={setView} options={[{ id: 'groups', label: 'Groups' }, { id: 'friends', label: 'Friends' }]} />
      </View>

      <Animated.View key={view} entering={reduce ? undefined : FadeIn.duration(180)} style={{ marginTop: 8 }}>
        {view === 'groups'
          ? store.groups.map((g) => {
              const debts = groupDebts(store.expenses, store.settlements, g);
              const n = youNet(debts, you);
              const mine = debts.filter((d) => d.fromId === you || d.toId === you);
              const color = n.net > 0 ? c.pos : n.net < 0 ? c.neg : c.mut;
              return (
                <Press key={g.id} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={g.icon} size={22} />
                  </View>
                  <View style={{ flex: 1, minHeight: 46, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }} numberOfLines={1}>{g.name}</Text>
                    {mine.length ? (
                      mine.slice(0, 2).map((d) => (
                        <Text key={`${d.fromId}-${d.toId}`} style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }} numberOfLines={1}>
                          {d.toId === you ? `${first(d.fromId)} owes you ₹${inr(d.amount)}` : `You owe ${first(d.toId)} ₹${inr(d.amount)}`}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>{g.memberIds.length + 1} people</Text>
                    )}
                    {mine.length > 2 ? <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>and {mine.length - 2} more</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', minHeight: 46, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font.body, fontSize: 11.5, color }}>{n.net > 0 ? 'you are owed' : n.net < 0 ? 'you owe' : 'settled up'}</Text>
                    {n.net ? <Text style={{ fontFamily: font.displaySm, fontSize: 16, color }}>₹{inr(Math.abs(n.net))}</Text> : null}
                  </View>
                </Press>
              );
            })
          : friends.map((f) => {
              const p = store.people.find((x) => x.id === f.id);
              const color = f.net > 0.5 ? c.pos : f.net < -0.5 ? c.neg : c.mut;
              return (
                <Press key={f.id} onPress={() => router.push({ pathname: '/person/[id]', params: { id: f.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
                  <Avatar id={f.id} label={p?.initials ?? '?'} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }} numberOfLines={1}>{p?.name ?? 'Someone'}</Text>
                    <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>
                      {groupCount(f.groups)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: font.body, fontSize: 11.5, color }}>{f.net > 0.5 ? 'owes you' : f.net < -0.5 ? 'you owe' : 'settled up'}</Text>
                    {Math.abs(f.net) > 0.5 ? <Text style={{ fontFamily: font.displaySm, fontSize: 16, color }}>₹{inr(Math.abs(f.net))}</Text> : null}
                  </View>
                </Press>
              );
            })}
      </Animated.View>

      {store.groups.length === 0 ? (
        <View style={{ marginTop: 40, alignItems: 'flex-start', gap: 10 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="account-group-outline" size={28} />
          </View>
          <Word size={20}>No groups yet</Word>
          <Text style={{ fontFamily: font.body, color: c.mut, fontSize: 14, lineHeight: 20 }}>
            Make one for a trip, a flat, or Friday lunches. Share its code and friends join from their phones.
          </Text>
          <Press onPress={() => router.push('/new-group')} style={{ marginTop: 6, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: c.acc, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={18} color={c.accFg} />
            <Text style={{ fontFamily: font.semi, color: c.accFg }}>Start a group</Text>
          </Press>
        </View>
      ) : null}
    </ScrollView>
  );
}

function groupCount(groups: { groupId: string }[]) {
  const n = new Set(groups.map((g) => g.groupId)).size;
  return n ? `In ${n} ${n === 1 ? 'group' : 'groups'}` : 'No open balances';
}

function Total({ label, amount, color }: { label: string; amount: number; color: string }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
      <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.mut }}>{label}</Text>
      <Text style={{ fontFamily: font.displaySm, fontSize: 24, color, marginTop: 6 }}>₹{inr(amount)}</Text>
    </View>
  );
}
