import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back, Button, buzz, goBack, Icon, Press, TagPicker, usePalette, Word } from '@/components/ui';
import { inr, uid } from '@/lib/format';
import { equalShares, percentShares, round2 } from '@/lib/ledger';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

type Mode = 'equal' | 'exact' | 'percent';
type Who = { id: string; name: string };

// A quick split turns one bill into a small split with a few people. No trip or flat around it.
export default function QuickSplit() {
  const params = useLocalSearchParams<{ draftId?: string; expenseId?: string; tag?: string }>();
  const c = usePalette();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const source = params.expenseId ? store.expenses.find((e) => e.id === params.expenseId) : undefined;
  const draft = params.draftId ? store.queue.find((d) => d.id === params.draftId) : undefined;
  const fixed = !!(source || draft);

  const [desc, setDesc] = useState(source?.merchant ?? draft?.merchant ?? '');
  const [amt, setAmt] = useState(source ? String(source.amount) : draft ? String(draft.amount) : '');
  const [fresh, setFresh] = useState<Who[]>([]);
  const [picked, setPicked] = useState<Who[]>([]);
  const [newName, setNewName] = useState('');
  const [payer, setPayer] = useState(store.you.id);
  const [mode, setMode] = useState<Mode>('equal');
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [exact, setExact] = useState<Record<string, string>>({});
  const [pct, setPct] = useState<Record<string, string>>({});
  const [tag, setTag] = useState<string | null>(source?.tag ?? (params.tag || null));

  const you: Who = { id: store.you.id, name: 'You' };
  const known: Who[] = [...store.people.filter((p) => p.id !== store.you.id).map((p) => ({ id: p.id, name: p.name })), ...fresh];
  const members = [you, ...picked];
  const isOn = (id: string) => !off[id];
  const included = members.filter((m) => isOn(m.id)).map((m) => m.id);
  const amount = Number(amt) || 0;
  const pctOf = (id: string) => (pct[id] === undefined ? round2(100 / Math.max(1, included.length)) : Number(pct[id]) || 0);
  const shares = mode === 'equal'
    ? equalShares(amount, included)
    : mode === 'percent'
      ? percentShares(amount, Object.fromEntries(included.map((id) => [id, pctOf(id)])))
      : Object.fromEntries(included.map((id) => [id, Number(exact[id]) || 0]));
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  const pctSum = included.reduce((a, id) => a + pctOf(id), 0);
  const balanced = mode === 'equal' || (mode === 'exact' ? Math.abs(sum - amount) < 0.5 : Math.abs(pctSum - 100) < 0.5);
  const ok = amount > 0 && picked.length > 0 && included.length > 0 && balanced && (fixed || desc.trim().length > 0);
  const status = !picked.length
    ? 'Pick at least one person'
    : !included.length
      ? 'Pick at least one person'
      : mode === 'exact' && !balanced
        ? `₹${inr(Math.abs(amount - sum))} ${sum < amount ? 'unassigned' : 'over'}`
        : mode === 'percent' && !balanced
          ? `${Math.round(Math.abs(100 - pctSum))}% ${pctSum < 100 ? 'unassigned' : 'over'}`
          : 'Adds up';

  if (params.expenseId && !source && !draft) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>That expense is gone</Word>
      </View>
    );
  }

  const toggle = (w: Who) => {
    setPicked((p) => {
      const has = p.some((x) => x.id === w.id);
      if (has && payer === w.id) setPayer(store.you.id);
      return has ? p.filter((x) => x.id !== w.id) : [...p, w];
    });
  };
  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    const w = { id: uid(), name };
    setFresh((f) => [...f, w]);
    setPicked((p) => [...p, w]);
    setNewName('');
    buzz();
  };
  const save = () => {
    if (!ok) return;
    buzz('done');
    const id = store.quickSplit({
      expenseId: source?.id,
      draftId: draft?.id,
      amount: fixed ? undefined : amount,
      name: desc,
      people: picked,
      payerId: payer,
      shares,
      tag,
    });
    store.flash(id ? 'Split saved' : 'Could not split that');
    goBack();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>Quick split</Word>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 6, lineHeight: 19 }}>
        Share one bill with a few people. Only your part counts as your spend.
      </Text>
      <TextInput value={desc} onChangeText={setDesc} placeholder="What was it for?" placeholderTextColor={c.mut} style={{ marginTop: 16, fontFamily: font.medium, fontSize: 18, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: font.display, fontSize: 30, color: c.mut }}>₹</Text>
        <TextInput
          value={amt}
          onChangeText={(v) => setAmt(v.replace(/[^0-9.]/g, ''))}
          editable={!fixed}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c.bar}
          style={{ flex: 1, fontFamily: font.display, fontSize: 48, color: c.fg, padding: 0 }}
        />
      </View>

      <Label>With</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {known.map((w) => (
          <Chip key={w.id} label={w.name} on={picked.some((x) => x.id === w.id)} onPress={() => toggle(w)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addNew}
          submitBehavior="submit"
          placeholder="Add someone by name"
          placeholderTextColor={c.mut}
          style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }}
        />
        <Press onPress={addNew} disabled={!newName.trim()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={20} color={c.accFg} />
        </Press>
      </View>

      {picked.length ? (
        <>
          <Label>Paid by</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => (
              <Chip key={m.id} label={m.name} on={payer === m.id} onPress={() => setPayer(m.id)} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
            <Chip label="Equally" on={mode === 'equal'} onPress={() => setMode('equal')} />
            <Chip label="Exact" on={mode === 'exact'} onPress={() => setMode('exact')} />
            <Chip label="Percent" on={mode === 'percent'} onPress={() => setMode('percent')} />
          </View>
          <View style={{ marginTop: 12 }}>
            {members.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
                <Press onPress={() => setOff((s) => ({ ...s, [m.id]: !s[m.id] }))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: isOn(m.id) ? c.acc : c.line, backgroundColor: isOn(m.id) ? c.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {isOn(m.id) ? <Icon name="check" size={14} color={c.accFg} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontFamily: font.medium, color: isOn(m.id) ? c.fg : c.mut }}>{m.name}</Text>
                </Press>
                {mode === 'exact' && isOn(m.id) ? (
                  <TextInput value={exact[m.id] ?? ''} onChangeText={(v) => setExact((s) => ({ ...s, [m.id]: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.mut} style={{ width: 90, textAlign: 'right', fontFamily: font.displaySm, fontSize: 16, color: c.fg }} />
                ) : mode === 'percent' && isOn(m.id) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut }}>₹{inr(shares[m.id] || 0)}</Text>
                    <TextInput value={pct[m.id] ?? String(pctOf(m.id))} onChangeText={(v) => setPct((s) => ({ ...s, [m.id]: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" style={{ width: 54, textAlign: 'right', fontFamily: font.displaySm, fontSize: 16, color: c.fg }} />
                    <Text style={{ fontFamily: font.displaySm, color: c.mut }}>%</Text>
                  </View>
                ) : (
                  <Text style={{ fontFamily: font.displaySm, color: isOn(m.id) ? c.fg : c.mut }}>₹{inr(shares[m.id] || 0)}</Text>
                )}
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: ok || (amount > 0 && picked.length > 0 && balanced) ? c.pos : c.neg, marginTop: 6 }}>{amount > 0 ? status : 'Enter an amount'}</Text>
      {fixed ? null : <View style={{ marginTop: 18 }}><TagPicker value={tag} onChange={setTag} /></View>}
      <View style={{ height: 24 }} />
      <Button label="Save split" onPress={save} disabled={!ok} />
    </ScrollView>
  );
}

function Label({ children }: { children: string }) {
  const c = usePalette();
  return <Text style={{ marginTop: 22, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut, textTransform: 'uppercase' }}>{children}</Text>;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.medium, color: on ? c.accFg : c.fg }}>{label}</Text>
    </Press>
  );
}
