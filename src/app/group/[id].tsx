import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Avatar, Back, buzz, Icon, Press, Segmented, SettleRow, SwipeShift, timeline, useDark, usePalette, Word } from '@/components/ui';
import { dust, inr } from '@/lib/format';
import { groupDebts, groupTotals, memberNets, pairDebts, personName, exactSteps, youNet, type Debt } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font, tagColors } from '@/lib/theme';
import type { Expense, Person, Settlement } from '@/lib/types';

type Tab = 'activity' | 'balances' | 'totals';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>('activity');
  const [how, setHow] = useState(false);
  const group = store.groups.find((g) => g.id === id);
  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>That group is gone</Word>
        <Text style={{ color: c.mut, fontFamily: font.body, marginTop: 8 }}>It may have been deleted by its owner.</Text>
      </View>
    );
  }

  const you = store.you.id;
  const simplified = group.simplify !== false;
  const pairs = pairDebts(store.expenses, store.settlements, group.id);
  const debts = groupDebts(store.expenses, store.settlements, group);
  const net = youNet(debts, you);
  const routes = simplified ? exactSteps(pairs, debts).flatMap((s) => s.because) : [];
  const mine = debts.filter((d) => d.fromId === you || d.toId === you);
  const nets = memberNets(pairs);
  const totals = groupTotals(store.expenses, group, you);
  const name = (pid: string) => personName(store.people, store.you, pid);
  const inline = (pid: string) => (pid === you ? 'you' : name(pid));
  const members: Person[] = [store.you, ...group.memberIds.map((pid) => store.people.find((p) => p.id === pid) ?? { id: pid, name: 'Someone', initials: '?' })];
  const openPerson = (pid: string) => router.push({ pathname: '/person/[id]', params: { id: pid } });

  const invite = () => {
    if (!group.code) return store.flash('The code appears once the group reaches the server');
    buzz();
    Share.share({ message: `Join "${group.name}" on Kakei. with code ${group.code}\nkakei://join?code=${group.code}` });
  };

  const removeSettlement = (s: Settlement) => {
    ask({
      title: 'Remove this payment?',
      body: `${name(s.fromId)} paid ${inline(s.toId)} ₹${inr(s.amount)}. Removing it puts that amount back on the balances for everyone in ${group.name}.`,
      confirm: 'Remove payment',
      destructive: true,
      onConfirm: () => {
        store.removeSettlement(s.id);
        store.flash('Payment removed');
      },
    });
  };

  const events = [
    ...store.expenses.filter((e) => e.groupId === group.id).map((e) => ({ kind: 'exp' as const, at: e.at, e })),
    ...store.settlements.filter((s) => s.groupId === group.id).map((s) => ({ kind: 'set' as const, at: s.at, s })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const feed = timeline(events, (ev) =>
    ev.kind === 'set' ? (
      <SettleRow key={ev.s.id} s={ev.s} you={you} name={name} onPress={() => removeSettlement(ev.s)} />
    ) : (
      <ExpenseRow key={ev.e.id} e={ev.e} you={you} name={name} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: ev.e.id } })} />
    ),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <SwipeShift
        onNext={() => setTab((t) => (t === 'activity' ? 'balances' : t === 'balances' ? 'totals' : 'activity'))}
        onPrev={() => setTab((t) => (t === 'totals' ? 'balances' : t === 'balances' ? 'activity' : 'totals'))}
      >
      <ScrollView
        stickyHeaderIndices={tab === 'activity' ? feed.sticky.map((i) => i + 1) : undefined}
        contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Back />
            <Press onPress={() => router.push({ pathname: '/group-settings', params: { id: group.id } })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="cog-outline" size={22} />
            </Press>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={group.icon} size={26} />
            </View>
            <View style={{ flex: 1 }}>
              <Word size={26} style={{ lineHeight: 30 }}>{group.name}</Word>
              <Press onPress={() => router.push({ pathname: '/group-settings', params: { id: group.id } })} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                {members.slice(0, 5).map((p, i) => (
                  <View key={p.id} style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: c.bg, borderRadius: 10 }}>
                    <Avatar id={p.id} label={p.initials} size={22} you={p.id === you} />
                  </View>
                ))}
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginLeft: 8 }}>{members.length} people</Text>
              </Press>
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={{ fontFamily: font.semi, fontSize: 17, color: net.net > 0 ? c.pos : net.net < 0 ? c.neg : c.fg }}>
              {net.net > 0 ? `You are owed ₹${inr(net.net)}` : net.net < 0 ? `You owe ₹${inr(-net.net)}` : 'You are all settled up'}
            </Text>
            {mine.map((d) => {
              const other = d.toId === you ? d.fromId : d.toId;
              const owedToYou = d.toId === you;
              return (
                <Press key={`${d.fromId}-${d.toId}`} onPress={() => openPerson(other)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ flex: 1, fontFamily: font.body, fontSize: 14, color: c.mut }}>
                    {owedToYou ? `${name(other)} owes you ` : `You owe ${name(other)} `}
                    <Text style={{ fontFamily: font.semi, color: owedToYou ? c.pos : c.neg }}>₹{inr(d.amount)}</Text>
                  </Text>
                  <Icon name="chevron-right" size={18} color={c.mut} />
                </Press>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            {mine.length ? (
              <Action label="Settle up" icon="handshake-outline" primary onPress={() => router.push({ pathname: '/settle', params: { groupId: group.id } })} />
            ) : null}
            <Action label="Add expense" icon="plus" primary={!mine.length} onPress={() => router.push({ pathname: '/split', params: { groupId: group.id } })} />
            <Action label="Invite" icon="account-plus-outline" onPress={invite} iconOnly />
          </View>

          <View style={{ marginTop: 26 }}>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[{ id: 'activity', label: 'Activity' }, { id: 'balances', label: 'Balances' }, { id: 'totals', label: 'Totals' }]}
            />
          </View>
        </View>

        {tab === 'activity' ? (
          events.length ? feed.nodes : (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Icon name="receipt-text-outline" size={30} color={c.mut} />
              <Text style={{ fontFamily: font.semi, color: c.fg, marginTop: 10 }}>No expenses yet</Text>
              <Text style={{ fontFamily: font.body, color: c.mut, marginTop: 4, textAlign: 'center' }}>Add one, or send a bank SMS here from Review.</Text>
            </View>
          )
        ) : (
          <Animated.View key={tab} entering={reduce ? undefined : FadeIn.duration(180)}>
            {tab === 'balances' ? (
              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: c.fg }}>Who pays whom</Text>
                  {simplified ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: c.sub }}>
                      <Icon name="auto-fix" size={13} color={c.mut} />
                      <Text style={{ fontFamily: font.semi, fontSize: 11.5, color: c.mut }}>Simplified</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4, marginBottom: 8, lineHeight: 19 }}>
                  {simplified
                    ? pairs.length > debts.length
                      ? `${debts.length} ${debts.length === 1 ? 'payment' : 'payments'} instead of ${pairs.length}.`
                      : 'Already the fewest payments possible.'
                    : 'Showing every debt between pairs. Turn on Simplify in group settings for fewer payments.'}
                </Text>
                {debts.map((d, i) => (
                  <Flow key={`${d.fromId}-${d.toId}`} d={d} i={i} you={you} people={members} reduce={reduce} via={routes.filter((r) => r.fromId === d.fromId && r.toId === d.toId).map((r) => inline(r.viaId))} />
                ))}
                {debts.length === 0 ? <Text style={{ fontFamily: font.body, color: c.mut, paddingVertical: 8 }}>Everyone is square.</Text> : null}

                {simplified && pairs.length > debts.length ? (
                  <View style={{ marginTop: 12, borderRadius: 18, backgroundColor: c.sub, overflow: 'hidden' }}>
                    <Press onPress={() => { buzz(); setHow((v) => !v); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52 }}>
                      <Icon name="routes" size={19} color={c.mut} />
                      <Text style={{ flex: 1, fontFamily: font.semi, fontSize: 14, color: c.fg }}>How this was simplified</Text>
                      <Icon name={how ? 'chevron-up' : 'chevron-down'} size={20} color={c.mut} />
                    </Press>
                    {how ? (
                      <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        <Text style={{ fontFamily: font.semi, fontSize: 12.5, color: c.mut, marginBottom: 6 }}>What people owed, pair by pair</Text>
                        {pairs.map((p) => (
                          <View key={`${p.fromId}>${p.toId}`} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                            <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13.5, color: c.fg }} numberOfLines={1}>{name(p.fromId)} owed {inline(p.toId)}</Text>
                            <Text style={{ fontFamily: font.semi, fontSize: 13.5, color: c.fg }}>₹{inr(p.amount)}</Text>
                          </View>
                        ))}
                        {routes.length ? <Text style={{ fontFamily: font.semi, fontSize: 12.5, color: c.mut, marginTop: 14, marginBottom: 6 }}>What was rerouted</Text> : null}
                        {routes.map((r) => (
                          <Text key={`${r.fromId}>${r.viaId}`} style={{ fontFamily: font.body, fontSize: 13.5, lineHeight: 20, color: c.fg, paddingVertical: 3 }}>
                            {name(r.fromId)} owed {inline(r.viaId)} ₹{inr(r.amount)}, and {inline(r.viaId)} owed {inline(r.toId)}. So that money goes straight to {inline(r.toId)}.
                          </Text>
                        ))}
                        <Text style={{ fontFamily: font.body, fontSize: 13, lineHeight: 19, color: c.mut, marginTop: 10 }}>
                          Each person still pays or gets back exactly the same total. Only the route changes, so {pairs.length - debts.length === 1 ? 'one payment is' : `${pairs.length - debts.length} payments are`} saved.
                        </Text>
                      </Animated.View>
                    ) : null}
                  </View>
                ) : null}

                <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: c.fg, marginTop: 32, marginBottom: 4 }}>Everyone</Text>
                {members.map((p) => {
                  const v = nets[p.id] || 0;
                  return (
                    <Press key={p.id} onPress={() => openPerson(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                      <Avatar id={p.id} label={p.initials} you={p.id === you} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>{p.id === you ? 'You' : p.name}</Text>
                        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: v > dust ? c.pos : v < -dust ? c.neg : c.mut, marginTop: 2 }}>
                          {v > dust ? `gets back ₹${inr(v)}` : v < -dust ? `owes ₹${inr(-v)}` : 'settled up'}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={c.mut} />
                    </Press>
                  );
                })}
              </View>
            ) : null}

            {tab === 'totals' ? (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontFamily: font.body, color: c.mut }}>Total group spend</Text>
                <Text style={{ fontFamily: font.display, fontSize: 30, color: c.fg, marginTop: 2, marginBottom: 10 }}>₹{inr(totals.total)}</Text>
                {totals.rows.map((row) => {
                  const p = members.find((m) => m.id === row.id);
                  const pct = totals.total ? Math.min(100, (row.paid / totals.total) * 100) : 0;
                  return (
                    <Press key={row.id} onPress={() => openPerson(row.id)} style={{ paddingVertical: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Avatar id={row.id} label={p?.initials ?? '?'} size={32} you={row.id === you} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: font.medium, color: c.fg }}>{name(row.id)}</Text>
                          <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>Paid ₹{inr(row.paid)}, share ₹{inr(row.share)}</Text>
                        </View>
                        <Text style={{ fontFamily: font.displaySm, color: row.net >= 0 ? c.pos : c.neg }}>{row.net >= 0 ? '+' : '−'}₹{inr(Math.abs(row.net))}</Text>
                      </View>
                      <View style={{ height: 3, borderRadius: 2, backgroundColor: c.faint, marginTop: 10, marginLeft: 44 }}>
                        <View style={{ width: `${pct}%`, height: 3, borderRadius: 2, backgroundColor: c.fg }} />
                      </View>
                    </Press>
                  );
                })}
              </View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
      </SwipeShift>
    </View>
  );
}

function Action({ label, icon, onPress, primary, iconOnly }: { label: string; icon: string; onPress: () => void; primary?: boolean; iconOnly?: boolean }) {
  const c = usePalette();
  return (
    <Press
      onPress={onPress}
      style={{ ...(iconOnly ? { width: 44 } : { flex: 1, paddingHorizontal: 12 }), height: 44, borderRadius: 22, backgroundColor: primary ? c.acc : c.sub, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      <Icon name={icon} size={18} color={primary ? c.accFg : c.fg} />
      {iconOnly ? null : <Text style={{ fontFamily: font.semi, fontSize: 14, color: primary ? c.accFg : c.fg }} numberOfLines={1}>{label}</Text>}
    </Press>
  );
}

function ExpenseRow({ e, you, name, onPress }: { e: Expense; you: string; name: (id: string) => string; onPress: () => void }) {
  const c = usePalette();
  const isDark = useDark();
  const col = tagColors(e.tag ?? 'untagged', isDark);
  const share = e.shares?.[you] ?? 0;
  const paid = e.payerId === you;
  const lent = paid ? e.amount - share : 0;
  const status = paid
    ? { label: 'you lent', amt: lent, color: c.pos }
    : share > 0
      ? { label: 'you borrowed', amt: share, color: c.neg }
      : { label: 'not involved', amt: 0, color: c.mut };
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: col.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="receipt-text-outline" size={19} color={col.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }} numberOfLines={1}>{e.merchant}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }} numberOfLines={1}>
          {paid ? 'You' : name(e.payerId ?? '')} paid ₹{inr(e.amount)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: font.body, fontSize: 11, color: status.color }}>{status.label}</Text>
        {status.amt > 0 ? <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: status.color }}>₹{inr(status.amt)}</Text> : null}
      </View>
    </Press>
  );
}

function Flow({ d, i, you, people, reduce, via }: { d: Debt; i: number; you: string; people: Person[]; reduce: boolean; via: string[] }) {
  const c = usePalette();
  const who = (pid: string) => people.find((p) => p.id === pid);
  const from = who(d.fromId);
  const to = who(d.toId);
  const tone = d.fromId === you ? c.neg : d.toId === you ? c.pos : null;
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.delay(i * 50).duration(260)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}
    >
      <View style={{ alignItems: 'center', width: 64 }}>
        <Avatar id={d.fromId} label={from?.initials ?? '?'} size={34} you={d.fromId === you} />
        <Text style={{ fontFamily: font.medium, fontSize: 11.5, color: c.fg, marginTop: 4 }} numberOfLines={1}>{d.fromId === you ? 'You' : from?.name.split(' ')[0] ?? 'Someone'}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', marginBottom: via.length ? 0 : 16 }}>
        <Text style={{ fontFamily: font.displaySm, fontSize: 15, color: tone ?? c.fg }}>₹{inr(d.amount)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 2 }}>
          <View style={{ flex: 1, height: 1.5, backgroundColor: tone ?? c.line }} />
          <Icon name="chevron-right" size={16} color={tone ?? c.mut} />
        </View>
        {via.length ? <Text style={{ fontFamily: font.body, fontSize: 11, color: c.mut, marginTop: 1 }} numberOfLines={1}>via {via.join(', ')}</Text> : null}
      </View>
      <View style={{ alignItems: 'center', width: 64 }}>
        <Avatar id={d.toId} label={to?.initials ?? '?'} size={34} you={d.toId === you} />
        <Text style={{ fontFamily: font.medium, fontSize: 11.5, color: c.fg, marginTop: 4 }} numberOfLines={1}>{d.toId === you ? 'You' : to?.name.split(' ')[0] ?? 'Someone'}</Text>
      </View>
    </Animated.View>
  );
}
