import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { Avatar, Back, Button, buzz, goBack, Icon, Press, usePalette, Word } from '@/components/ui';
import { inrExact } from '@/lib/format';
import { groupDebts, personName } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

// The whole amount owed, to the paisa, so the screen opens ready to confirm in one tap.
const full = (n: number) => String(Math.round(n * 100) / 100);

// Kakei does not move money. You pay however you like, outside the app, then mark it done here.
export default function Settle() {
  const { groupId, with: withId } = useLocalSearchParams<{ groupId: string; with?: string }>();
  const c = usePalette();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const group = store.groups.find((g) => g.id === groupId);
  const debts = group ? groupDebts(store.expenses, store.settlements, group).filter((d) => d.fromId === store.you.id || d.toId === store.you.id) : [];
  const first = debts.find((d) => d.fromId === withId || d.toId === withId) ?? debts[0];
  const [pick, setPick] = useState(first ? `${first.fromId}|${first.toId}` : '');
  const chosen = debts.find((d) => `${d.fromId}|${d.toId}` === pick) ?? first;
  const [amt, setAmt] = useState(chosen ? full(chosen.amount) : '');
  const [done, setDone] = useState<null | { line: string; sub: string }>(null);

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(20).stiffness(220)} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.pos, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={42} color={c.bg} />
        </Animated.View>
        <Animated.View entering={reduce ? undefined : FadeInDown.delay(140).duration(320)} style={{ alignItems: 'center' }}>
          <Word size={28} style={{ marginTop: 24, textAlign: 'center' }}>{done.line}</Word>
          <Text style={{ fontFamily: font.body, color: c.mut, marginTop: 8, textAlign: 'center' }}>{done.sub}</Text>
        </Animated.View>
        <View style={{ marginTop: 32, alignSelf: 'stretch' }}>
          <Button label="Done" onPress={goBack} />
        </View>
      </View>
    );
  }

  if (!group || !chosen) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>All square</Word>
        <Text style={{ fontFamily: font.body, color: c.mut, marginTop: 8 }}>Nothing for you to settle in this group.</Text>
      </View>
    );
  }

  const youPay = chosen.fromId === store.you.id;
  const other = youPay ? chosen.toId : chosen.fromId;
  const otherName = personName(store.people, store.you, other);
  const payee = store.people.find((p) => p.id === other);
  const amount = Number(amt);

  const over = amount > chosen.amount + 0.005;
  const partial = amount > 0 && !over && amount < chosen.amount - 0.005;

  const record = () => {
    if (!(amount > 0) || over) return;
    store.settle({ groupId: group.id, fromId: chosen.fromId, toId: chosen.toId, amount, at: new Date().toISOString() });
    buzz('done');
    setDone({
      line: `₹${inrExact(amount)} ${youPay ? `paid to ${otherName}` : `received from ${otherName}`}`,
      sub: `${group.name}, marked as done`,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
      <Back />
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar id={chosen.fromId} label={chosen.fromId === store.you.id ? store.you.initials : payee?.initials ?? '?'} size={48} you={chosen.fromId === store.you.id} />
          <Icon name="arrow-right" size={20} color={c.mut} />
          <Avatar id={chosen.toId} label={chosen.toId === store.you.id ? store.you.initials : payee?.initials ?? '?'} size={48} you={chosen.toId === store.you.id} />
        </View>
        <Word size={26} style={{ marginTop: 16, textAlign: 'center' }}>{youPay ? `You pay ${otherName.split(' ')[0]}` : `${otherName.split(' ')[0]} pays you`}</Word>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4 }}>{group.name}</Text>
      </View>

      {debts.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {debts.map((d) => {
            const key = `${d.fromId}|${d.toId}`;
            const on = key === `${chosen.fromId}|${chosen.toId}`;
            const label = d.fromId === store.you.id ? `To ${personName(store.people, store.you, d.toId)}` : `From ${personName(store.people, store.you, d.fromId)}`;
            return (
              <Press key={key} onPress={() => { buzz(); setPick(key); setAmt(full(d.amount)); }} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? c.acc : c.sub, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.medium, color: on ? c.accFg : c.fg, fontSize: 13 }}>{label} ₹{inrExact(d.amount)}</Text>
              </Press>
            );
          })}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 }}>
        <Text style={{ fontFamily: font.display, fontSize: 30, color: c.mut }}>₹</Text>
        <Input value={amt} onChangeText={(v) => setAmt(v.replace(/[^0-9.]/g, ''))} mode="decimal" label="Amount paid" placeholder="0" style={{ fontFamily: font.display, fontSize: 56, color: c.fg, minWidth: 80, textAlign: 'center' }} />
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 13.5, color: over ? c.neg : c.mut, textAlign: 'center', marginTop: 4 }}>
        {over
          ? `That is more than the ₹${inrExact(chosen.amount)} owed.`
          : partial
            ? `Partial. ₹${inrExact(chosen.amount - amount)} stays open.`
            : amount > 0
              ? 'The full amount. Tap the number to pay less.'
              : 'Enter what was paid.'}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        {[['Full', chosen.amount], ['Half', chosen.amount / 2]].map(([label, v]) => {
          const on = Math.abs(amount - Number(v)) < 0.005;
          return (
            <Press key={String(label)} onPress={() => { buzz(); setAmt(full(Number(v))); }} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{label} ₹{inrExact(Number(v))}</Text>
            </Press>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <Text style={{ fontFamily: font.body, fontSize: 13, lineHeight: 19, color: c.mut, textAlign: 'center', marginBottom: 16 }}>
        {youPay ? `Pay ${otherName} however you like, then mark it here.` : `Mark it once ${otherName} has paid you.`}
      </Text>
      <Button label={`Mark ₹${inrExact(amount > 0 ? amount : 0)} as ${youPay ? 'paid' : 'received'}`} onPress={record} disabled={!(amount > 0) || over} />
    </View>
  );
}
