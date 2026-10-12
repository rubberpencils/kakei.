import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { Back, Button, buzz, Icon, Press, usePalette, Word } from '@/components/ui';
import { inrExact, prettyDay } from '@/lib/format';
import { cardBills } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

// The whole amount owed, to the paisa, so paying the full bill is one tap.
const full = (n: number) => String(Math.round(n * 100) / 100);

// Credit card spend lands here by itself. Nothing to tag. Paying the card, in full or in part, is the only step left.
export default function CardBill() {
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const cards = cardBills(store.expenses, store.you.id);
  const total = cards.reduce((a, b) => a + b.due, 0);
  const [paying, setPaying] = useState<string | null>(null);
  const [amt, setAmt] = useState('');

  const start = (key: string, due: number) => {
    buzz();
    setPaying(key);
    setAmt(full(due));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>Credit card bill</Word>
      <Text style={{ marginTop: 20, fontFamily: font.display, fontSize: 52, letterSpacing: -1.5, color: c.fg }}>₹{inrExact(total)}</Text>
      <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 14, color: c.mut, lineHeight: 20 }}>
        {cards.length
          ? 'Everything you paid for with a credit card and have not paid off yet.'
          : 'Nothing due. Pick Credit card under Paid with when you add a spend and it shows up here.'}
      </Text>

      {cards.map((card) => {
        const title = card.account ? `${card.bank ?? 'Card'} ••${card.account}` : 'Credit card';
        const open = paying === card.key;
        const amount = Number(amt);
        const over = amount > card.due + 0.005;
        const partial = amount > 0 && !over && amount < card.due - 0.005;
        const pay = () => {
          if (!(amount > 0) || over) return;
          buzz('done');
          store.payCardBill(card.bank, card.account, amount);
          setPaying(null);
        };
        return (
          <View key={card.key} style={{ marginTop: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="credit-card-outline" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }} numberOfLines={1}>{title}</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 1 }}>
                  {card.charges.length} {card.charges.length === 1 ? 'spend' : 'spends'}{card.lastPaid ? `, last paid ${prettyDay(card.lastPaid)}` : ''}
                </Text>
              </View>
              <Text style={{ fontFamily: font.displaySm, fontSize: 19, color: c.fg }}>₹{inrExact(card.due)}</Text>
            </View>
            <View style={{ marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.faint }}>
              {card.charges.slice(0, 8).map((e) => (
                <Press key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.faint }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }} numberOfLines={1}>{e.merchant}</Text>
                    <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 1 }}>{prettyDay(e.at)}</Text>
                  </View>
                  <Text style={{ fontFamily: font.displaySm, fontSize: 14.5, color: c.fg }}>₹{inrExact(e.amount)}</Text>
                </Press>
              ))}
              {card.charges.length > 8 ? (
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, paddingVertical: 10 }}>and {card.charges.length - 8} more</Text>
              ) : null}
            </View>

            {open ? (
              <View style={{ marginTop: 18, padding: 16, borderRadius: 20, backgroundColor: c.sub }}>
                <Text style={{ fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PAYING</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontFamily: font.display, fontSize: 30, color: c.mut }}>₹</Text>
                  <Input value={amt} onChangeText={(v) => setAmt(v.replace(/[^0-9.]/g, ''))} mode="decimal" label={`Paying ${title}`} placeholder="0" style={{ flex: 1, fontFamily: font.display, fontSize: 44, color: over ? c.neg : c.fg }} />
                </View>
                <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: over ? c.neg : c.mut }}>
                  {over
                    ? `That is more than the ₹${inrExact(card.due)} due.`
                    : partial
                      ? `Part payment. ₹${inrExact(card.due - amount)} stays due.`
                      : amount > 0
                        ? 'The full bill. Tap the number to pay less.'
                        : 'Enter what you paid.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {([['Full', card.due], ['Half', card.due / 2]] as const).map(([label, v]) => {
                    const on = Math.abs(amount - v) < 0.005;
                    return (
                      <Press key={label} onPress={() => { buzz(); setAmt(full(v)); }} style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{label} ₹{inrExact(v)}</Text>
                      </Press>
                    );
                  })}
                </View>
                <View style={{ marginTop: 16, gap: 4 }}>
                  <Button label={`Confirm ₹${inrExact(amount > 0 ? amount : 0)} paid`} onPress={pay} disabled={!(amount > 0) || over} />
                  <Press onPress={() => setPaying(null)} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.mut }}>Cancel</Text>
                  </Press>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <Button label={`Pay ₹${inrExact(card.due)}`} onPress={() => start(card.key, card.due)} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
