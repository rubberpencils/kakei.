import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Avatar, Back, buzz, Icon, Press, Toggle, usePalette, Word } from '@/components/ui';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const ICONS = ['account-group', 'airplane', 'home-variant', 'silverware-fork-knife', 'beach', 'party-popper', 'car', 'briefcase-outline'];

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const group = store.groups.find((g) => g.id === id);
  const [name, setName] = useState(group?.name ?? '');
  const [who, setWho] = useState('');

  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, paddingTop: insets.top + 8 }}>
        <Back />
        <Word size={24}>That group is gone</Word>
      </View>
    );
  }

  const members = [store.you, ...group.memberIds.map((pid) => store.people.find((p) => p.id === pid) ?? { id: pid, name: 'Someone', initials: '?' })];
  const saveName = () => {
    if (name.trim() && name.trim() !== group.name) store.updateGroup(group.id, { name });
    else setName(group.name);
  };
  const add = () => {
    if (!who.trim()) return;
    store.addMember(group.id, who);
    buzz();
    setWho('');
  };
  const share = () => {
    if (!group.code) return store.flash(store.signedIn ? 'The code appears once the group reaches the server' : 'Turn on sync in Profile to invite friends');
    Share.share({ message: `Join "${group.name}" on Kakei. with code ${group.code}\nkakei://join?code=${group.code}` });
  };
  const remove = () => {
    const go = () => {
      store.deleteGroup(group.id);
      router.dismissTo('/groups');
    };
    ask({ title: `Delete ${group.name}?`, body: 'Every expense and payment in it is removed for all members.', confirm: 'Delete group', destructive: true, onConfirm: go });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Back />
      <Word size={28}>Group settings</Word>

      <Text style={label(c.mut)}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={saveName}
        onBlur={saveName}
        style={{ fontFamily: font.semi, fontSize: 20, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        {ICONS.map((i) => {
          const on = group.icon === i;
          return (
            <Press key={i} onPress={() => store.updateGroup(group.id, { icon: i })} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: on ? c.acc : c.sub, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i} size={20} color={on ? c.accFg : c.fg} />
            </Press>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 30 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="auto-fix" size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>Simplify debts</Text>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2, lineHeight: 17 }}>
            Reroutes money so the group settles in the fewest payments. Nobody ends up paying more.
          </Text>
        </View>
        <Toggle on={group.simplify !== false} onPress={() => store.updateGroup(group.id, { simplify: group.simplify === false })} />
      </View>

      <Text style={label(c.mut)}>People</Text>
      {members.map((p) => (
        <Press key={p.id} onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
          <Avatar id={p.id} label={p.initials} you={p.id === store.you.id} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>{p.id === store.you.id ? `${p.name} (you)` : p.name}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 1 }}>
              {p.id === store.you.id || p.claimed ? 'On Kakei.' : 'Not joined yet. They pick this name when joining.'}
            </Text>
          </View>
        </Press>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <TextInput
          value={who}
          onChangeText={setWho}
          onSubmitEditing={add}
          submitBehavior="submit"
          placeholder="Add someone by name"
          placeholderTextColor={c.mut}
          style={{ flex: 1, fontFamily: font.body, fontSize: 15, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.faint, paddingVertical: 8 }}
        />
        <Press onPress={add} disabled={!who.trim()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={20} color={c.accFg} />
        </Press>
      </View>

      <Text style={label(c.mut)}>Invite code</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.mono, fontSize: 28, letterSpacing: 5, color: c.fg }}>{group.code ?? '------'}</Text>
        <Press onPress={share} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.acc, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="share-variant" size={16} color={c.accFg} />
          <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 14 }}>Share</Text>
        </Press>
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 8, lineHeight: 18 }}>
        Friends open Groups, tap Join with code, then pick their name so past splits become theirs.
      </Text>

      {group.owner ? (
        <Press onPress={remove} style={{ marginTop: 36, height: 50, borderRadius: 25, borderWidth: 1, borderColor: c.neg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.semi, color: c.neg }}>Delete group</Text>
        </Press>
      ) : null}
    </ScrollView>
  );
}

const label = (color: string) => ({ marginTop: 30, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color, textTransform: 'uppercase' as const });
