import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Avatar, Icon, Press, Section, TxnRow, usePalette, Word, Wordmark } from '@/components/ui';
import { dayKey, inr, monthName } from '@/lib/format';
import { groupDebts, monthBounds, spendIn, youNet } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

export default function Home() {
  const c = usePalette();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const bounds = monthBounds(y, m);
  const month = spendIn(store.expenses, store.settlements, store.you.id, bounds.from, bounds.to);
  const left = Math.max(0, store.budget - month.total);
  const pct = Math.min(100, store.budget ? (month.total / store.budget) * 100 : 0);
  // Money you paid for others and have not got back yet. It sits after your share, in green, and is not spend.
  const backPct = store.budget ? Math.min(100 - pct, (month.back / store.budget) * 100) : 0;
  const day = now.getDate();
  const days = new Date(y, m, 0).getDate();
  const pace = day >= 5 ? Math.round((month.total / day) * days) : null;
  const onTrack = pace == null || pace <= store.budget;

  const nets = store.groups.reduce(
    (acc, g) => {
      const debts = groupDebts(store.expenses, store.settlements, g);
      const n = youNet(debts, store.you.id);
      acc.owed += n.owed;
      acc.owe += n.owe;
      acc.owedPeople += debts.filter((d) => d.toId === store.you.id).length;
      if (n.owe > 0.005) acc.oweGroups += 1;
      return acc;
    },
    { owed: 0, owe: 0, owedPeople: 0, oweGroups: 0 },
  );

  const week = [...Array(7)].map((_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    const key = dayKey(d.toISOString());
    return { label: d.toLocaleDateString('en-IN', { weekday: 'narrow' }), key, today: i === 6, v: month.byDay[key]?.total ?? spendIn(store.expenses, store.settlements, store.you.id, key, key).total };
  });
  const wMax = Math.max(...week.map((d) => d.v), 1);

  const recent = [...store.expenses]
    .filter((e) => !e.groupId || e.reflect)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  const preview = store.queue.slice(0, 2).map((d) => d.merchant).join(', ');
  const empty = !store.expenses.length && !store.groups.length && !store.queue.length;
  const budgetLine = !store.budget
    ? 'Set a monthly budget in Profile to see savings'
    : pace == null
      ? `Early in ${monthName(m)} · ₹${inr(left)} left of ₹${inr(store.budget)}`
      : onTrack
        ? `On track · save about ₹${inr(store.budget - pace)} this month`
        : `Pace is ₹${inr(pace - store.budget)} over budget`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Svg style={{ position: 'absolute', top: 0 }} width={width} height={280}>
        <Defs>
          <RadialGradient id="glow" cx="18%" cy="0%" r="80%">
            <Stop offset="0" stopColor={c.brand} stopOpacity={0.16} />
            <Stop offset="1" stopColor={c.brand} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={280} fill="url(#glow)" />
      </Svg>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24 }}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Press onPress={() => router.push('/search')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="magnify" size={23} />
              </Press>
              <Press onPress={() => router.push('/review')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell-outline" size={23} />
                {store.queue.length ? <View style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: c.brand }} /> : null}
              </Press>
              <Press onPress={() => router.push('/profile')} style={{ marginLeft: 4 }}>
                <Avatar id={store.you.id} label={store.you.initials} size={34} you />
              </Press>
            </View>
          </View>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut }}>
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            {store.sync === 'offline' ? `, offline${store.pending ? ` with ${store.pending} waiting` : ''}` : ''}
          </Text>

          <Text style={{ marginTop: 24, fontFamily: font.medium, fontSize: 13, color: c.mut }}>Spent in {monthName(m)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
            <Text style={{ fontFamily: font.display, fontSize: 26, color: c.mut }}>₹</Text>
            <Text style={{ fontFamily: font.display, fontSize: 58, letterSpacing: -2, color: c.fg, lineHeight: 64 }}>{inr(month.total)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c.bar, flexDirection: 'row', overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 4, backgroundColor: c.acc }} />
              {backPct > 0 ? <View style={{ width: `${backPct}%`, height: 4, backgroundColor: c.pos }} /> : null}
            </View>
            {store.budget ? <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut }}>₹{inr(left)} left</Text> : null}
          </View>
          {month.back > 0.005 ? (
            <Press onPress={() => router.push({ pathname: '/balances', params: { side: 'owed' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.pos }} />
              <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.pos }}>₹{inr(month.back)} still to get back from friends</Text>
              <Icon name="chevron-right" size={16} color={c.pos} />
            </Press>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Icon name={onTrack ? 'trending-down' : 'trending-up'} size={16} color={onTrack ? c.pos : c.neg} />
            <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: !store.budget ? c.mut : onTrack ? c.pos : c.neg }}>{budgetLine}</Text>
          </View>

          {empty ? (
            <View style={{ marginTop: 28, gap: 10 }}>
              <Word size={20}>Start your ledger</Word>
              <Text style={{ fontFamily: font.body, fontSize: 14, color: c.mut, lineHeight: 20 }}>
                Confirm a bank SMS, add a spend by hand, or make a group with friends.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                <Pill icon="message-text-outline" label="Review SMS" onPress={() => router.push('/review')} />
                <Pill icon="plus" label="Add expense" onPress={() => router.push('/add')} />
                <Pill icon="account-multiple-plus" label="New group" onPress={() => router.push('/new-group')} />
                <Pill icon="flask-outline" label="Try sample data" onPress={store.loadSample} />
              </View>
            </View>
          ) : null}

          <Section title="This week" />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 78 }}>
            {week.map((d) => (
              <View key={d.key} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <View style={{ width: '100%', height: Math.max(4, (d.v / wMax) * 56), borderRadius: 6, backgroundColor: d.today ? c.acc : d.v ? c.bar : c.faint }} />
                <Text style={{ marginTop: 6, fontSize: 10.5, fontFamily: d.today ? font.semi : font.body, color: d.today ? c.fg : c.mut }}>{d.label}</Text>
              </View>
            ))}
          </View>

          {store.queue.length ? (
            <Press onPress={() => router.push('/review')} style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.accFg, fontFamily: font.bold, fontSize: 13 }}>{store.queue.length}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semi, fontSize: 14.5, color: c.fg }}>New bank transactions</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }} numberOfLines={1}>{preview}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={c.mut} />
            </Press>
          ) : (
            <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheetHair, borderBottomWidth: StyleSheetHair, borderColor: c.faint }}>
              <Icon name="check-all" size={20} color={c.pos} />
              <Text style={{ fontFamily: font.body, fontSize: 14, color: c.mut }}>No new bank SMS to review</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Press onPress={() => router.push({ pathname: '/balances', params: { side: 'owed' } })} style={{ flex: 1, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
              <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.mut }}>Owed to you</Text>
              <Text style={{ fontFamily: font.displaySm, fontSize: 26, color: nets.owed > 0.005 ? c.pos : c.fg, marginTop: 6 }}>₹{inr(nets.owed)}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 4 }}>{nets.owedPeople} {nets.owedPeople === 1 ? 'person' : 'people'}</Text>
            </Press>
            <Press onPress={() => router.push({ pathname: '/balances', params: { side: 'owe' } })} style={{ flex: 1, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
              <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.mut }}>You owe</Text>
              <Text style={{ fontFamily: font.displaySm, fontSize: 26, color: nets.owe > 0.005 ? c.neg : c.fg, marginTop: 6 }}>₹{inr(nets.owe)}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 4 }}>{nets.oweGroups} {nets.oweGroups === 1 ? 'group' : 'groups'}</Text>
            </Press>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          <Section title="Groups" action="See all" onAction={() => router.push('/groups')} />
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}>
            {store.groups.filter((g) => g.kind !== 'split').map((g) => {
              const n = youNet(groupDebts(store.expenses, store.settlements, g), store.you.id);
              const color = n.net > 0 ? c.pos : n.net < 0 ? c.neg : c.mut;
              return (
                <Press key={g.id} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} style={{ width: 156, minHeight: GROUP_CARD_H, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Icon name={g.icon} size={20} />
                  </View>
                  <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }} numberOfLines={1}>{g.name}</Text>
                  <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>{g.memberIds.length + 1} people</Text>
                  <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.mut, marginTop: 14 }}>{n.net > 0.005 ? 'Owed to you' : n.net < -0.005 ? 'You owe' : 'Settled up'}</Text>
                  <Text style={{ fontFamily: font.displaySm, fontSize: 20, color, marginTop: 2 }}>{Math.abs(n.net) > 0.005 ? `₹${inr(Math.abs(n.net))}` : '₹0'}</Text>
                </Press>
              );
            })}
            <Press onPress={() => router.push('/new-group')} style={{ width: 90, minHeight: GROUP_CARD_H, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="account-multiple-plus" size={24} color={c.mut} />
              <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, textAlign: 'center' }}>New{'\n'}group</Text>
            </Press>
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          <Section title="Recent" action="See all" onAction={() => router.push('/personal')} />
          {recent.map((e) => <TxnRow key={e.id} item={e} />)}
        </View>
      </ScrollView>
    </View>
  );
}

const StyleSheetHair = StyleSheet.hairlineWidth;
// Group cards and the New group tile share this height, so the tile looks the same with zero groups or many.
const GROUP_CARD_H = 184;

function Pill({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.sub, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Icon name={icon} size={17} />
      <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: c.fg }}>{label}</Text>
    </Press>
  );
}
