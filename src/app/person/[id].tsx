import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Back, Icon, Press, Segmented, SwipeShift, timeline, usePalette, Word } from '@/components/ui';
import { dust, inr } from '@/lib/format';
import { friendBalances, personName, whyYouPay } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';
import type { Expense, Settlement } from '@/lib/types';

type Filter = 'all' | 'shared';
type Ev = { kind: 'exp'; at: string; e: Expense } | { kind: 'set'; at: string; s: Settlement };

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const you = store.you.id;
  const isYou = id === you;
  const person = isYou ? store.you : store.people.find((p) => p.id === id);
  const name = (pid: string) => personName(store.people, store.you, pid);
  const first = isYou ? 'You' : (person?.name.split(' ')[0] ?? 'They');

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>Not found</Word>
      </View>
    );
  }

  const balance = isYou ? null : friendBalances(store.expenses, store.settlements, store.groups, you).find((f) => f.id === id);
  const net = balance?.net ?? 0;
  const inExp = (e: Expense, pid: string) => e.payerId === pid || !!e.shares?.[pid];
  const inSet = (s: Settlement, pid: string) => s.fromId === pid || s.toId === pid;

  const events: Ev[] = [
    ...store.expenses
      .filter((e) => (isYou ? (filter === 'all' ? !e.groupId || inExp(e, id) : !!e.groupId && inExp(e, id)) : inExp(e, id) && (filter === 'all' || inExp(e, you))))
      .map((e) => ({ kind: 'exp' as const, at: e.at, e })),
    ...store.settlements
      .filter((s) => inSet(s, id) && (isYou || filter === 'all' || inSet(s, you)))
      .map((s) => ({ kind: 'set' as const, at: s.at, s })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const feed = timeline(events, (ev) => (ev.kind === 'exp' ? <Row key={ev.e.id} e={ev.e} subject={id} first={first} name={name} /> : <SetRow key={ev.s.id} s={ev.s} name={name} />));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <SwipeShift
        onNext={() => setFilter((f) => (f === 'all' ? 'shared' : 'all'))}
        onPrev={() => setFilter((f) => (f === 'shared' ? 'all' : 'shared'))}
      >
      <ScrollView stickyHeaderIndices={feed.sticky.map((i) => i + 1)} contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }}>
        <View>
          <Back />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar id={person.id} label={person.initials} size={56} you={isYou} />
            <View style={{ flex: 1 }}>
              <Word size={26} style={{ lineHeight: 30 }}>{isYou ? 'Your activity' : person.name}</Word>
              <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 3 }}>
                {isYou ? 'Everything you paid for or were split into' : person.claimed ? 'On Kakei.' : 'Not on Kakei. yet'}
              </Text>
            </View>
          </View>

          {!isYou ? (
            <View style={{ marginTop: 22 }}>
              <Text style={{ fontFamily: font.display, fontSize: 22, letterSpacing: -0.6, color: net > dust ? c.pos : net < -dust ? c.neg : c.fg }}>
                {net > dust ? `${first} owes you ₹${inr(net)}` : net < -dust ? `You owe ${first} ₹${inr(-net)}` : 'All settled up'}
              </Text>
              {whyYouPay(you, id, store.expenses, store.settlements).map((line, i) => (
                <Text key={`${line.expenseId ?? line.kind}-${i}`} style={{ fontFamily: font.body, fontSize: 13.5, color: c.mut, marginTop: 6 }}>
                  {line.direction === 'owe' ? 'You owe' : `${first} owes you`} ₹{inr(line.amount)} · {line.label}
                </Text>
              ))}
              {balance?.groups.filter((g) => Math.abs(g.net) > dust).map((g) => {
                const group = store.groups.find((x) => x.id === g.groupId);
                if (!group) return null;
                return (
                  <View key={g.groupId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                    <Press onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={group.icon} size={17} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }} numberOfLines={1}>{group.name}</Text>
                        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: g.net > 0 ? c.pos : c.neg, marginTop: 1 }}>
                          {g.net > 0 ? `owes you ₹${inr(g.net)}` : `you owe ₹${inr(-g.net)}`}
                        </Text>
                      </View>
                    </Press>
                    <Press
                      onPress={() => router.push({ pathname: '/settle', params: { groupId: group.id, with: id } })}
                      style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.acc, justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.accFg }}>Settle</Text>
                    </Press>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={{ marginTop: 24 }}>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={isYou ? [{ id: 'all', label: 'Everything' }, { id: 'shared', label: 'Shared only' }] : [{ id: 'all', label: `All of ${first}'s` }, { id: 'shared', label: 'With you' }]}
            />
          </View>
        </View>

        {events.length ? feed.nodes : (
          <View style={{ alignItems: 'center', paddingVertical: 36 }}>
            <Icon name="receipt-text-outline" size={30} color={c.mut} />
            <Text style={{ fontFamily: font.body, color: c.mut, marginTop: 10, textAlign: 'center' }}>Nothing here yet.</Text>
          </View>
        )}
      </ScrollView>
      </SwipeShift>
    </View>
  );
}

function Row({ e, subject, first, name }: { e: Expense; subject: string; first: string; name: (id: string) => string }) {
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const group = e.groupId ? store.groups.find((g) => g.id === e.groupId) : null;
  const share = e.shares?.[subject] ?? 0;
  const paid = e.payerId === subject;
  const status = !e.groupId
    ? { label: e.income ? 'received' : 'spent', amt: e.amount, color: e.income ? c.pos : c.fg }
    : paid
      ? { label: `${first} lent`, amt: e.amount - share, color: c.pos }
      : { label: `${first} borrowed`, amt: share, color: c.neg };
  return (
    <Press onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }} numberOfLines={1}>{e.merchant}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }} numberOfLines={1}>
          {group ? `${name(e.payerId ?? '')} paid ₹${inr(e.amount)} in ${group.name}` : 'Personal'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: font.body, fontSize: 11, color: status.color }}>{status.label}</Text>
        <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: status.color }}>₹{inr(status.amt)}</Text>
      </View>
    </Press>
  );
}

function SetRow({ s, name }: { s: Settlement; name: (id: string) => string }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="cash-check" size={18} color={c.pos} />
        <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg, flex: 1 }} numberOfLines={1}>
          {name(s.fromId)} paid {name(s.toId) === 'You' ? 'you' : name(s.toId)}
        </Text>
      </View>
      <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: c.pos }}>₹{inr(s.amount)}</Text>
    </View>
  );
}
