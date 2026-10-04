import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Back, goBack, Icon, Press, TagPicker, Toggle, usePalette, Word } from '@/components/ui';
import { inr, prettyDay } from '@/lib/format';
import { owedBack, personName, pocket, remainingOwed, youStillOwe } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font, RAIL_ICON, RAIL_LABEL } from '@/lib/theme';

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const e = store.expenses.find((x) => x.id === id);

  if (!e) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>This expense is gone</Word>
        <Text style={{ fontFamily: font.body, color: c.mut, marginTop: 8 }}>Someone in the group may have removed it.</Text>
      </View>
    );
  }

  const group = e.groupId ? store.groups.find((g) => g.id === e.groupId) : null;
  const rem = remainingOwed(store.expenses, store.settlements);
  const you = store.you.id;
  const name = (pid: string) => personName(store.people, store.you, pid);
  const owed = owedBack(e, you, rem);
  const owe = youStillOwe(e, you, rem);
  const mine = group ? pocket(e, you, rem) : e.amount;

  const remove = () => {
    const go = () => {
      store.removeExpense(e.id);
      store.flash('Expense removed');
      goBack();
    };
    ask({
      title: `Remove ${e.merchant}?`,
      body: group ? `It is removed for everyone in ${group.name}, and balances update.` : 'It comes off your spending for the month.',
      confirm: 'Remove expense',
      destructive: true,
      onConfirm: go,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }}>
      <Back />
      <Text style={{ fontFamily: font.body, color: c.mut, fontSize: 13 }}>{prettyDay(e.at)}{group ? ` · ${group.name}` : ''}</Text>
      <Word size={28} style={{ marginTop: 4 }}>{e.merchant}</Word>
      <Text style={{ fontFamily: font.display, fontSize: 48, letterSpacing: -1.5, color: e.income ? c.pos : c.fg, marginTop: 10 }}>
        {e.income ? '+' : '−'}₹{inr(e.amount)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Chip icon={RAIL_ICON[e.rail]} label={RAIL_LABEL[e.rail]} />
        {e.bank && e.account ? <Chip icon="bank-outline" label={`${e.bank} ••${e.account}`} /> : null}
        {e.recurring ? <Chip icon="repeat" label={e.recurring} /> : null}
        {e.transfer ? <Chip icon="swap-horizontal" label="Card bill, not spend" /> : null}
      </View>

      <Text style={{ marginTop: 28, marginBottom: 10, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>TAG</Text>
      <TagPicker value={e.tag} onChange={(tag) => store.updateExpense({ ...e, tag })} />

      {group && e.shares ? (
        <>
          <Text style={{ marginTop: 28, marginBottom: 6, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>SPLIT</Text>
          <Text style={{ fontFamily: font.body, color: c.mut, fontSize: 13, marginBottom: 6 }}>{name(e.payerId ?? '')} paid</Text>
          {Object.entries(e.shares).map(([pid, v]) => (
            <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.faint }}>
              <Text style={{ flex: 1, fontFamily: font.medium, color: c.fg }}>{name(pid)}</Text>
              <Text style={{ fontFamily: font.displaySm, color: c.fg }}>₹{inr(v)}</Text>
            </View>
          ))}
          {owed > 0 ? <Text style={{ fontFamily: font.medium, color: c.pos, marginTop: 10 }}>Still owed back ₹{inr(owed)}</Text> : null}
          {owe > 0 ? <Text style={{ fontFamily: font.medium, color: c.neg, marginTop: 10 }}>You still owe ₹{inr(owe)}</Text> : null}
          <Press onPress={() => router.push({ pathname: '/split', params: { expenseId: e.id } })} style={{ marginTop: 14, alignSelf: 'flex-start', height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="pencil-outline" size={16} />
            <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 13 }}>Edit split</Text>
          </Press>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>Show in personal</Text>
              <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>
                {e.reflect ? `Counts ₹${inr(mine)} toward your spend` : 'Hidden from your personal spend'}
              </Text>
            </View>
            <Toggle on={e.reflect} onPress={() => store.updateExpense({ ...e, reflect: !e.reflect })} />
          </View>
        </>
      ) : null}

      {!group && !e.income ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 26 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>Credit card bill</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>Paying a card is a transfer, so it is left out of spend.</Text>
          </View>
          <Toggle on={e.transfer} onPress={() => store.updateExpense({ ...e, transfer: !e.transfer })} />
        </View>
      ) : null}
      {e.recurring ? (
        <Press
          onPress={() => store.expenses.filter((x) => x.recurId === e.recurId && x.recurring).forEach((x) => store.updateExpense({ ...x, recurring: null }))}
          style={{ marginTop: 22 }}
        >
          <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 14 }}>Stop repeating</Text>
        </Press>
      ) : null}

      <Press onPress={remove} style={{ marginTop: 32, height: 50, borderRadius: 25, borderWidth: 1, borderColor: c.neg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.semi, color: c.neg }}>Remove expense</Text>
      </Press>
    </ScrollView>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.sub }}>
      <Icon name={icon} size={15} />
      <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.fg, textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}
