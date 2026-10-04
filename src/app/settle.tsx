import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Avatar, Back, Button, buzz, Ghost, goBack, Icon, Press, usePalette, Word } from '@/components/ui';
import { inr } from '@/lib/format';
import { groupDebts, personName } from '@/lib/ledger';
import { payWithUpi } from '@/lib/sms';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';
import { maskVpa, upiLink, type PayStatus } from '@/lib/upi';

const PAY_ERRORS: Partial<Record<PayStatus, string>> = {
  failed: 'The payment failed in your UPI app. No money moved, so nothing was recorded.',
  cancelled: 'No result came back from the UPI app, so nothing was recorded. If money did leave your account, use Mark as paid.',
  'no-app': 'No UPI app found on this phone. Pay another way, then mark it as paid.',
  unsupported: 'This version of the app cannot open UPI apps. Update it, or pay another way and mark it as paid.',
};

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
  const [amt, setAmt] = useState(chosen ? String(Math.round(chosen.amount)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  const canUpi = youPay && !!payee?.vpa && Platform.OS !== 'web';

  const record = (method: 'upi' | 'cash') => {
    if (!amount) return;
    store.settle({ groupId: group.id, fromId: chosen.fromId, toId: chosen.toId, amount, at: new Date().toISOString(), method });
    buzz('done');
    setDone({
      line: `₹${inr(amount)} ${youPay ? `paid to ${otherName}` : `received from ${otherName}`}`,
      sub: `${group.name}, ${method === 'upi' ? 'paid by UPI' : 'marked as paid'}`,
    });
  };

  const payUpi = async () => {
    if (!amount || !payee?.vpa || busy) return;
    setError('');
    setBusy(true);
    const status = await payWithUpi(upiLink({ vpa: payee.vpa, amount, note: `Settle with ${otherName} from ${group.name}` }));
    setBusy(false);
    if (status === 'success') return record('upi');
    if (status === 'pending' || status === 'unknown') {
      return ask({
        title: `Did ₹${inr(amount)} reach ${otherName}?`,
        body: status === 'pending'
          ? 'Your UPI app says the payment is still processing. Record it once your bank confirms it.'
          : 'Your UPI app does not report back on this phone. Record it only if the app showed the payment as successful.',
        confirm: 'Yes, record it',
        onConfirm: () => record('upi'),
      });
    }
    buzz();
    setError(PAY_ERRORS[status] ?? 'Something went wrong.');
  };

  const note = youPay
    ? payee?.vpa
      ? Platform.OS === 'web'
        ? 'UPI apps open from the phone app. Pay there, or pay another way and mark it here.'
        : null
      : `${otherName} has not added a UPI ID, so pay them however you like and mark it here.`
    : store.you.vpa
      ? `${otherName} can pay you by UPI from their phone. Mark it here if they paid another way.`
      : 'Add your UPI ID in Profile so friends can pay you in one tap.';

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
              <Press key={key} onPress={() => { buzz(); setPick(key); setAmt(String(Math.round(d.amount))); setError(''); }} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? c.acc : c.sub, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.medium, color: on ? c.accFg : c.fg, fontSize: 13 }}>{label} ₹{inr(d.amount)}</Text>
              </Press>
            );
          })}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 }}>
        <Text style={{ fontFamily: font.display, fontSize: 30, color: c.mut }}>₹</Text>
        <TextInput value={amt} onChangeText={(v) => { setAmt(v.replace(/[^0-9.]/g, '')); setError(''); }} keyboardType="decimal-pad" style={{ fontFamily: font.display, fontSize: 56, color: c.fg, minWidth: 80, textAlign: 'center' }} />
      </View>
      {amount > 0 && amount < chosen.amount - 0.5 ? (
        <Text style={{ fontFamily: font.body, color: c.mut, textAlign: 'center' }}>Partial. ₹{inr(chosen.amount - amount)} stays open.</Text>
      ) : null}

      <View style={{ flex: 1 }} />

      {error ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(160)} style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: c.sub, marginBottom: 16 }}>
          <Icon name="alert-circle-outline" size={18} color={c.neg} />
          <Text style={{ flex: 1, fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.fg }}>{error}</Text>
        </Animated.View>
      ) : note ? (
        <Text style={{ fontFamily: font.body, fontSize: 13, lineHeight: 19, color: c.mut, textAlign: 'center', marginBottom: 16 }}>{note}</Text>
      ) : null}

      {canUpi ? (
        <>
          <Button label={busy ? 'Waiting for UPI app' : `Pay ₹${inr(amount || 0)} with UPI`} icon="arrow-top-right" onPress={payUpi} disabled={!(amount > 0) || busy} />
          <Text onLongPress={() => router.push({ pathname: '/upi-lab', params: { to: other, am: String(amount) } })} style={{ fontFamily: font.body, fontSize: 12, color: c.mut, textAlign: 'center', marginTop: 8 }}>To {maskVpa(payee!.vpa!)}</Text>
          <Ghost label="I paid another way" onPress={() => record('cash')} />
        </>
      ) : (
        <Button label={youPay ? 'Mark as paid' : 'Mark as received'} onPress={() => record('cash')} disabled={!(amount > 0)} />
      )}
    </View>
  );
}
