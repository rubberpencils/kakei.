import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { buzz, goBack, Icon, Press, TagPicker, Toggle, usePalette } from '@/components/ui';
import { localNoon, uid } from '@/lib/format';
import { useKeyboard } from '@/lib/keyboard';
import { equalShares } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font, RAIL_ICON, RAIL_LABEL } from '@/lib/theme';
import type { Rail } from '@/lib/types';

const RAILS: Rail[] = ['upi', 'credit', 'debit', 'cash'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

export default function Add() {
  const c = usePalette();
  const store = useStore();
  const params = useLocalSearchParams<{ rail?: string }>();
  const { field } = useKeyboard();
  const [kind, setKind] = useState<'exp' | 'inc'>('exp');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [rail, setRail] = useState<Rail>(params.rail === 'cash' ? 'cash' : 'upi');
  const [seenRail, setSeenRail] = useState(params.rail);
  if (seenRail !== params.rail) {
    setSeenRail(params.rail);
    if (params.rail === 'cash') setRail('cash');
  }
  const [rec, setRec] = useState(false);
  const [freq, setFreq] = useState<'weekly' | 'monthly'>('monthly');
  const [daysAgo, setDaysAgo] = useState(0);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [payer, setPayer] = useState(store.you.id);
  const insets = useSafeAreaInsets();

  // Real groups only. A quick split is made from one bill, not added to.
  const groups = store.groups.filter((g) => g.kind !== 'split');
  const group = kind === 'exp' && groupId ? groups.find((g) => g.id === groupId) ?? null : null;
  const members = group ? [store.you.id, ...group.memberIds] : [];
  const name = (id: string) => (id === store.you.id ? 'You' : store.people.find((p) => p.id === id)?.name ?? 'Someone');
  const onYourCard = rail === 'credit' && kind === 'exp' && (!group || payer === store.you.id);

  const pickGroup = (id: string | null) => {
    buzz();
    setGroupId(id);
    setPayer(store.you.id);
  };

  const push = (k: string) => {
    setAmt((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === '.') return v.includes('.') ? v : `${v || '0'}.`;
      if (v.includes('.') && v.split('.')[1].length >= 2) return v;
      if (v.replace('.', '').length >= 7) return v;
      return v === '0' ? k : v + k;
    });
  };

  const save = () => {
    const amount = Number(amt);
    if (!amount) return;
    const at = new Date();
    at.setDate(at.getDate() - daysAgo);
    buzz('done');
    store.addExpense({
      merchant: note.trim() || (kind === 'inc' ? 'Income' : 'Expense'),
      amount,
      at: daysAgo ? localNoon(at.getFullYear(), at.getMonth() + 1, at.getDate()) : at.toISOString(),
      tag,
      rail,
      income: kind === 'inc',
      // A card bill payment is recorded from the card bill screen, never by a switch here.
      transfer: false,
      recurring: rec && !group ? freq : null,
      recurId: rec && !group ? `r${uid()}` : null,
      groupId: group?.id ?? null,
      payerId: group ? payer : null,
      shares: group ? equalShares(amount, members) : null,
      reflect: true,
    });
    if (group) store.flash(`Added to ${group.name}`);
    goBack();
  };

  const shown = amt ? Number(amt.split('.')[0] || '0').toLocaleString('en-IN') + (amt.includes('.') ? `.${amt.split('.')[1]}` : '') : '0';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: field ? 0 : insets.bottom }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
        <Press onPress={goBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={24} /></Press>
        <View style={{ flexDirection: 'row', backgroundColor: c.sub, borderRadius: 18, padding: 3 }}>
          {(['exp', 'inc'] as const).map((k) => (
            <Press key={k} onPress={() => setKind(k)} style={{ height: 30, paddingHorizontal: 16, borderRadius: 15, backgroundColor: kind === k ? c.acc : 'transparent', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 13, color: kind === k ? c.accFg : c.fg }}>{k === 'exp' ? 'Expense' : 'Income'}</Text>
            </Press>
          ))}
        </View>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ textAlign: 'center', fontFamily: font.display, fontSize: 56, color: kind === 'inc' ? c.pos : c.fg }}>₹{shown}</Text>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="What was it for?"
          label="What was it for?"
          caps="sentences"
          style={{ textAlign: 'center', marginTop: 8, fontFamily: font.medium, fontSize: 16, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 }}>
          {['Today', 'Yesterday', '2 days ago'].map((label, i) => (
            <Press key={label} onPress={() => setDaysAgo(i)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: daysAgo === i ? c.acc : c.sub, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: daysAgo === i ? c.accFg : c.fg }}>{label}</Text>
            </Press>
          ))}
        </View>
        <Text style={{ marginTop: 18, marginBottom: 10, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>TAG</Text>
        <TagPicker value={tag} onChange={setTag} />
        <Text style={{ marginTop: 18, marginBottom: 10, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PAID WITH</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {RAILS.map((id) => {
              const on = rail === id;
              return (
                <Press key={id} onPress={() => setRail(id)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={RAIL_ICON[id]} size={16} color={on ? c.accFg : c.fg} />
                  <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{RAIL_LABEL[id]}</Text>
                </Press>
              );
            })}
          </View>
        </ScrollView>
        {onYourCard ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Icon name="credit-card-clock-outline" size={16} color={c.mut} />
            <Text style={{ flex: 1, fontFamily: font.body, fontSize: 12.5, color: c.mut, lineHeight: 17 }}>Added to your card bill. You do not need to do anything else.</Text>
          </View>
        ) : null}

        {kind === 'exp' && groups.length ? (
          <>
            <Text style={{ marginTop: 18, marginBottom: 10, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>ADD TO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <GroupChip label="Just me" icon="account-outline" on={!group} onPress={() => pickGroup(null)} />
                {groups.map((g) => (
                  <GroupChip key={g.id} label={g.name} icon={g.icon} on={group?.id === g.id} onPress={() => pickGroup(g.id)} />
                ))}
              </View>
            </ScrollView>
            {group ? (
              <>
                <Text style={{ marginTop: 14, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PAID BY</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {members.map((id) => (
                    <GroupChip key={id} label={name(id)} on={payer === id} onPress={() => { buzz(); setPayer(id); }} />
                  ))}
                </View>
                <Text style={{ marginTop: 10, fontFamily: font.body, fontSize: 12.5, color: c.mut, lineHeight: 17 }}>
                  Split equally between {members.length} people. Open the expense later to change who owes what.
                </Text>
              </>
            ) : null}
          </>
        ) : null}

        {!group ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }}>Repeat</Text>
            <Toggle on={rec} onPress={() => setRec((v) => !v)} />
          </View>
        ) : null}
        {rec && !group ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {(['weekly', 'monthly'] as const).map((f) => (
              <Press key={f} onPress={() => setFreq(f)} style={{ flex: 1, height: 34, borderRadius: 17, borderWidth: 1, borderColor: freq === f ? c.acc : c.line, backgroundColor: freq === f ? c.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.medium, color: freq === f ? c.accFg : c.fg }}>{f}</Text>
              </Press>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: c.faint, paddingHorizontal: 16, paddingBottom: field ? 10 : 16 }}>
        {field ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {KEYS.map((k) => (
              <Press key={k} onPress={() => push(k)} style={{ width: '33.33%', height: 48, alignItems: 'center', justifyContent: 'center' }}>
                {k === 'del' ? <Icon name="backspace-outline" size={22} /> : <Text style={{ fontFamily: font.displaySm, fontSize: 24, color: c.fg }}>{k}</Text>}
              </Press>
            ))}
          </View>
        )}
        <Press onPress={save} style={{ marginTop: field ? 10 : 0, height: 52, borderRadius: 26, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center', opacity: Number(amt) > 0 ? 1 : 0.4 }}>
          <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 16 }}>{group ? `Save to ${group.name}` : kind === 'inc' ? 'Save income' : 'Save expense'}</Text>
        </Press>
      </View>
    </View>
  );
}

function GroupChip({ label, icon, on, onPress }: { label: string; icon?: string; on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} size={16} color={on ? c.accFg : c.fg} /> : null}
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{label}</Text>
    </Press>
  );
}
