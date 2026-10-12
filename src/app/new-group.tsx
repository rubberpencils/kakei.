import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back, Button, buzz, Icon, Press, usePalette, Word } from '@/components/ui';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const ICONS = ['account-group', 'airplane', 'home-variant', 'silverware-fork-knife', 'beach', 'party-popper'];

export default function NewGroup() {
  const c = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createGroup } = useStore();
  const [name, setName] = useState('');
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
    const id = createGroup(name.trim(), who.trim() && !members.includes(who.trim()) ? [...members, who.trim()] : members, icon);
    router.replace({ pathname: '/group/[id]', params: { id } });
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>New group</Word>
      <TextInput value={name} onChangeText={setName} autoFocus placeholder="Goa trip, Flat 4B..." placeholderTextColor={c.mut} style={{ marginTop: 24, fontFamily: font.semi, fontSize: 20, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        {ICONS.map((i) => (
          <Press key={i} onPress={() => setIcon(i)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: icon === i ? c.acc : c.sub, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={i} size={20} color={icon === i ? c.accFg : c.fg} />
          </Press>
        ))}
      </View>
      <Text style={{ marginTop: 28, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>PEOPLE</Text>
      <Text style={{ marginTop: 4, fontFamily: font.body, fontSize: 13, color: c.mut }}>Add names now. They claim their spot later with the invite code.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TextInput value={who} onChangeText={setWho} onSubmitEditing={add} submitBehavior="submit" placeholder="Add a person" placeholderTextColor={c.mut} style={{ flex: 1, fontFamily: font.body, fontSize: 16, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }} />
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
        <Button label="Create group" onPress={create} disabled={!name.trim()} />
      </View>
    </ScrollView>
  );
}
