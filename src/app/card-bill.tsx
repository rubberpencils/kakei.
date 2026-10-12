import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Back, Button, Icon, Press, usePalette, Word } from '@/components/ui';
import { inr, prettyDay } from '@/lib/format';
import { cardBills } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

// Credit card spend lands here by itself. Nothing to tag. Paying the card is the only step left.
export default function CardBill() {
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const cards = cardBills(store.expenses, store.you.id);
  const total = cards.reduce((a, b) => a + b.due, 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }}>
      <Back />
      <Word size={28}>Credit card bill</Word>
      <Text style={{ marginTop: 20, fontFamily: font.display, fontSize: 52, letterSpacing: -1.5, color: c.fg }}>₹{inr(total)}</Text>
      <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 14, color: c.mut, lineHeight: 20 }}>
        {cards.length
          ? 'Everything you paid for with a credit card since the last bill you marked paid.'
          : 'Nothing due. Pick Credit card under Paid with when you add a spend and it shows up here.'}
      </Text>

      {cards.map((card) => {
        const title = card.account ? `${card.bank ?? 'Card'} ••${card.account}` : 'Credit card';
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
              <Text style={{ fontFamily: font.displaySm, fontSize: 19, color: c.fg }}>₹{inr(card.due)}</Text>
            </View>
            <View style={{ marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.faint }}>
              {card.charges.slice(0, 8).map((e) => (
                <Press key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.faint }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }} numberOfLines={1}>{e.merchant}</Text>
                    <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 1 }}>{prettyDay(e.at)}</Text>
                  </View>
                  <Text style={{ fontFamily: font.displaySm, fontSize: 14.5, color: c.fg }}>₹{inr(e.amount)}</Text>
                </Press>
              ))}
              {card.charges.length > 8 ? (
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, paddingVertical: 10 }}>and {card.charges.length - 8} more</Text>
              ) : null}
            </View>
            <View style={{ marginTop: 14 }}>
              <Button
                label={`Mark ₹${inr(card.due)} paid`}
                onPress={() => ask({
                  title: `Mark ${title} paid?`,
                  body: `₹${inr(card.due)} is recorded as a card payment. It is not counted as spend again.`,
                  confirm: 'Mark paid',
                  onConfirm: () => store.payCardBill(card.bank, card.account, card.due),
                })}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
