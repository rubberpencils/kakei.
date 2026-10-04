import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back, Button, buzz, goBack, Icon, Press, TagPicker, usePalette, Word } from '@/components/ui';
import { inr } from '@/lib/format';
import { equalShares, percentShares, round2 } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

type Mode = 'equal' | 'exact' | 'percent';

export default function Split() {
  const params = useLocalSearchParams<{ groupId?: string; draftId?: string; expenseId?: string; reflect?: string; tag?: string }>();
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const editing = params.expenseId ? store.expenses.find((e) => e.id === params.expenseId) : undefined;
  const draft = params.draftId ? store.queue.find((d) => d.id === params.draftId) : undefined;
  const group = store.groups.find((g) => g.id === (editing?.groupId ?? params.groupId)) ?? store.groups[0];
  const members = group ? [store.you.id, ...group.memberIds] : [store.you.id];
  const [desc, setDesc] = useState(editing?.merchant ?? draft?.merchant ?? '');
  const [amt, setAmt] = useState(editing ? String(editing.amount) : draft ? String(draft.amount) : '');
  const [payer, setPayer] = useState(editing?.payerId ?? store.you.id);
  const [mode, setMode] = useState<Mode>(editing ? 'exact' : 'equal');
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((id) => [id, editing ? !!editing.shares?.[id] : true])),
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    editing?.shares ? Object.fromEntries(Object.entries(editing.shares).map(([k, v]) => [k, String(v)])) : {},
  );
  const [pct, setPct] = useState<Record<string, string>>({});
  const [reflect, setReflect] = useState(editing ? editing.reflect : params.reflect !== '0');
  const [tag, setTag] = useState<string | null>(editing?.tag ?? (params.tag || null));

  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>Make a group first</Word>
        <Press onPress={() => router.replace('/new-group')} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: font.medium, color: c.fg }}>New group</Text>
        </Press>
      </View>
    );
  }

  const amount = Number(amt) || 0;
  const isOn = (id: string) => on[id] ?? true;
  const included = members.filter(isOn);
  const pctOf = (id: string) => (pct[id] === undefined ? round2(100 / Math.max(1, included.length)) : Number(pct[id]) || 0);
  const shares = mode === 'equal'
    ? equalShares(amount, included)
    : mode === 'percent'
      ? percentShares(amount, Object.fromEntries(included.map((id) => [id, pctOf(id)])))
      : Object.fromEntries(included.map((id) => [id, Number(exact[id]) || 0]));
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  const pctSum = included.reduce((a, id) => a + pctOf(id), 0);
  const balanced = mode === 'equal' || (mode === 'exact' ? Math.abs(sum - amount) < 0.5 : Math.abs(pctSum - 100) < 0.5);
  const ok = amount > 0 && included.length > 0 && balanced;
  const name = (id: string) => (id === store.you.id ? 'You' : store.people.find((p) => p.id === id)?.name ?? 'Someone');
  const status = !included.length
    ? 'Pick at least one person'
    : mode === 'exact' && !balanced
      ? `₹${inr(Math.abs(amount - sum))} ${sum < amount ? 'unassigned' : 'over'}`
      : mode === 'percent' && !balanced
        ? `${Math.round(Math.abs(100 - pctSum))}% ${pctSum < 100 ? 'unassigned' : 'over'}`
        : 'Adds up';

  const save = () => {
    if (!ok) return;
    buzz('done');
    if (editing) {
      store.updateExpense({ ...editing, merchant: desc.trim() || editing.merchant, amount, tag, payerId: payer, shares, reflect });
      store.flash('Split updated');
    } else if (draft) {
      store.confirmDraft(draft.id, { tag, groupId: group.id, reflect, shares, payerId: payer });
      store.flash('Split saved');
    } else {
      store.addExpense({
        merchant: desc.trim() || 'Group expense',
        amount,
        at: new Date().toISOString(),
        tag,
        rail: 'upi',
        income: false,
        transfer: false,
        recurring: null,
        recurId: null,
        groupId: group.id,
        payerId: payer,
        shares,
        reflect,
      });
    }
    goBack();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>{group.name}</Word>
      {!editing && !draft && store.groups.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
          {store.groups.map((g) => (
            <Chip key={g.id} label={g.name} on={g.id === group.id} onPress={() => router.setParams({ groupId: g.id })} />
          ))}
        </ScrollView>
      ) : null}
      <TextInput value={desc} onChangeText={setDesc} placeholder="What was it for?" placeholderTextColor={c.mut} style={{ marginTop: 16, fontFamily: font.medium, fontSize: 18, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: font.display, fontSize: 30, color: c.mut }}>₹</Text>
        <TextInput
          value={amt}
          onChangeText={(v) => setAmt(v.replace(/[^0-9.]/g, ''))}
          editable={!draft}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c.bar}
          style={{ flex: 1, fontFamily: font.display, fontSize: 48, color: c.fg, padding: 0 }}
        />
      </View>
      <Text style={{ marginTop: 16, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PAID BY</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {members.map((id) => (
          <Chip key={id} label={name(id)} on={payer === id} onPress={() => setPayer(id)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        <Chip label="Equally" on={mode === 'equal'} onPress={() => setMode('equal')} />
        <Chip label="Exact" on={mode === 'exact'} onPress={() => setMode('exact')} />
        <Chip label="Percent" on={mode === 'percent'} onPress={() => setMode('percent')} />
      </View>
      <View style={{ marginTop: 12 }}>
        {members.map((id) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
            <Press onPress={() => setOn((s) => ({ ...s, [id]: !(s[id] ?? true) }))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: isOn(id) ? c.acc : c.line, backgroundColor: isOn(id) ? c.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {isOn(id) ? <Icon name="check" size={14} color={c.accFg} /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: font.medium, color: isOn(id) ? c.fg : c.mut }}>{name(id)}</Text>
            </Press>
            {mode === 'exact' && isOn(id) ? (
              <TextInput value={exact[id] ?? ''} onChangeText={(v) => setExact((s) => ({ ...s, [id]: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.mut} style={{ width: 90, textAlign: 'right', fontFamily: font.displaySm, fontSize: 16, color: c.fg }} />
            ) : mode === 'percent' && isOn(id) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>₹{inr(shares[id] || 0)}</Text>
                <TextInput value={pct[id] ?? String(pctOf(id))} onChangeText={(v) => setPct((s) => ({ ...s, [id]: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" style={{ width: 54, textAlign: 'right', fontFamily: font.displaySm, fontSize: 16, color: c.fg }} />
                <Text style={{ fontFamily: font.displaySm, color: c.mut }}>%</Text>
              </View>
            ) : (
              <Text style={{ fontFamily: font.displaySm, color: isOn(id) ? c.fg : c.mut }}>₹{inr(shares[id] || 0)}</Text>
            )}
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: ok ? c.pos : c.neg, marginTop: 6 }}>{amount > 0 ? status : 'Enter an amount'}</Text>
      <View style={{ marginTop: 18 }}><TagPicker value={tag} onChange={setTag} /></View>
      <Press onPress={() => setReflect((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 22 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: reflect ? c.acc : 'transparent', borderWidth: 1, borderColor: reflect ? c.acc : c.line, alignItems: 'center', justifyContent: 'center' }}>
          {reflect ? <Icon name="check" size={14} color={c.accFg} /> : null}
        </View>
        <Text style={{ fontFamily: font.body, color: c.fg, flex: 1 }}>Reflect my share in personal expenses</Text>
      </Press>
      <Button label={editing ? 'Save changes' : `Save to ${group.name}`} onPress={save} disabled={!ok} />
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.medium, color: on ? c.accFg : c.fg }}>{label}</Text>
    </Press>
  );
}
