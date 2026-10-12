import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { Back, Button, buzz, Icon, Press, usePalette, Word } from '@/components/ui';
import { inr } from '@/lib/format';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const ICONS = ['account-group', 'airplane', 'home-variant', 'silverware-fork-knife', 'beach', 'party-popper'];

export default function NewGroup() {
  const c = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const { createGroup, groupFromExpense, expenses } = useStore();
  const from = expenseId ? expenses.find((e) => e.id === expenseId) : undefined;
  const [name, setName] = useState(from?.merchant ?? '');
  const [icon, setIcon] = useState(ICONS[0]);
  const [who, setWho] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const add = () => {
    const n = who.trim();
    if (!n || members.includes(n)) return setWho('');
    setMembers((m) => [...m, n]);
    setWho('');
  };
  const create = () => {
    if (!name.trim()) return;
    buzz('done');
    const people = who.trim() && !members.includes(who.trim()) ? [...members, who.trim()] : members;
    const id = from ? groupFromExpense(from.id, name.trim(), people, icon) : createGroup(name.trim(), people, icon);
    if (id) router.replace({ pathname: '/group/[id]', params: { id } });
  };
  const split = from ? from.amount / (members.length + 1 + (who.trim() && !members.includes(who.trim()) ? 1 : 0)) : 0;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>{from ? 'Make a group' : 'New group'}</Word>
      {from ? (
        <View style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: c.sub }}>
          <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }} numberOfLines={1}>{from.merchant}</Text>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 2 }}>
            ₹{inr(from.amount)} goes in as the first expense, paid by you and split equally{members.length ? `, about ₹${inr(split)} each` : ''}.
          </Text>
        </View>
      ) : null}
      <Input value={name} onChangeText={setName} autoFocus={!from} placeholder="Goa trip, Flat 4B..." label="Group name" caps="words" style={{ marginTop: 24, fontFamily: font.semi, fontSize: 20, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        {ICONS.map((i) => (
          <Press key={i} onPress={() => setIcon(i)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: icon === i ? c.acc : c.sub, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={i} size={20} color={icon === i ? c.accFg : c.fg} />
          </Press>
        ))}
      </View>
      <Text style={{ marginTop: 28, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PEOPLE</Text>
      <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 13, color: c.mut }}>Add names now. They claim their spot later with the invite code.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <Input value={who} onChangeText={setWho} onSubmitEditing={add} keepFocus placeholder="Add a person" label="Add a person" caps="words" style={{ flex: 1, fontFamily: font.body, fontSize: 16, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
        <Press onPress={add} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={22} color={c.accFg} />
        </Press>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {members.map((m) => (
          <Animated.View key={m} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)}>
            <Press onPress={() => setMembers((list) => list.filter((x) => x !== m))} style={{ paddingLeft: 12, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: c.sub, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: font.medium, color: c.fg }}>{m}</Text>
              <Icon name="close" size={14} color={c.mut} />
            </Press>
          </Animated.View>
        ))}
      </View>
      <View style={{ marginTop: 28 }}>
        <Button label={from ? 'Create group and add bill' : 'Create group'} onPress={create} disabled={!name.trim()} />
      </View>
    </ScrollView>
  );
}
