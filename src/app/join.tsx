import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Back, Body, Button, buzz, Icon, Press, Screen, Word, usePalette } from '@/components/ui';
import type { Invite } from '@/lib/api';
import { initials } from '@/lib/format';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

export default function Join() {
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ? String(params.code).toUpperCase() : '');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [claim, setClaim] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(!!params.code);

  const look = async (raw = code) => {
    setError(null);
    setBusy(true);
    show(await store.previewInvite(raw));
  };

  const show = (res: Invite | string) => {
    setBusy(false);
    if (typeof res === 'string') return setError(res);
    if (res.joined) {
      router.replace({ pathname: '/group/[id]', params: { id: res.group.id } });
      return;
    }
    setInvite(res);
    setClaim(null);
  };

  useEffect(() => {
    if (params.code) store.previewInvite(String(params.code)).then(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async () => {
    if (!invite) return;
    setBusy(true);
    const res = await store.joinGroup(code, claim);
    setBusy(false);
    if (typeof res === 'string') return setError(res);
    buzz('done');
    store.flash(`Joined ${invite.group.name}`);
    router.replace({ pathname: '/group/[id]', params: { id: res.groupId } });
  };

  const placeholders = invite?.members.filter((m) => m.claimable) ?? [];

  return (
    <Screen>
      <Back />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Word size={30} style={{ marginTop: 8 }}>Join a group</Word>
        <Body color={c.mut} style={{ marginTop: 8, lineHeight: 21 }}>
          Ask anyone in the group for its 6-letter code. It is on the group screen under Invite.
        </Body>
        <TextInput
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); setInvite(null); }}
          placeholder="K7Q2MX"
          placeholderTextColor={c.bar}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => look()}
          style={{ marginTop: 24, fontFamily: font.mono, fontSize: 34, letterSpacing: 6, color: c.fg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: error ? c.neg : c.line }}
        />
        {error ? <Text style={{ fontFamily: font.body, fontSize: 13, color: c.neg, marginTop: 8 }}>{error}</Text> : null}

        {invite ? (
          <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={invite.group.icon} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.displaySm, fontSize: 19, color: c.fg }}>{invite.group.name}</Text>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 2 }}>{invite.members.map((m) => m.name.split(' ')[0]).join(', ')}</Text>
              </View>
            </View>
            {placeholders.length ? (
              <>
                <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg, marginTop: 26 }}>Which one is you?</Text>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4, lineHeight: 19 }}>
                  Pick your name and every expense already split with that name becomes yours.
                </Text>
                <View style={{ marginTop: 12 }}>
                  {placeholders.map((m) => (
                    <Choice key={m.id} label={m.name} on={claim === m.id} onPress={() => setClaim(m.id)} />
                  ))}
                  <Choice label="I'm not on this list" on={claim === null} onPress={() => setClaim(null)} />
                </View>
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
      {invite ? (
        <Button label={busy ? 'Joining' : `Join ${invite.group.name}`} onPress={join} disabled={busy} />
      ) : (
        <Button label={busy ? 'Looking' : 'Find group'} onPress={() => look()} disabled={busy || code.length < 4} />
      )}
    </Screen>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.faint }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: on ? c.acc : c.sub, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.bold, fontSize: 11, color: on ? c.accFg : c.fg }}>{initials(label)}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 15, color: c.fg }}>{label}</Text>
      <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? c.fg : c.mut} />
    </Press>
  );
}
