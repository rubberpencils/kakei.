import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Icon, Press, usePalette } from '@/components/ui';
import { font } from '@/lib/theme';

const POINTS = [
  { icon: 'cellphone-lock', title: 'Your money stays on this phone', body: 'Spends, budget, tags and bank SMS are stored here. They are never uploaded.' },
  { icon: 'account-group-outline', title: 'Why there is a server', body: 'Only groups you share go to it, so friends see the same balances. It passes them between phones and keeps nothing else.' },
  { icon: 'lock-outline', title: 'Encrypted and private', body: 'Shared data travels over HTTPS and is stored encrypted. Passwords are hashed.' },
  { icon: 'wifi-off', title: 'Works without it', body: 'If the server is down or you are offline, Kakei keeps working and catches up later.' },
];

/**
 * What lives on the phone, what goes to the server and why. Shown in Profile.
 * With `collapsible` it folds into one line you tap open, so it does not crowd a form.
 */
export function PrivacyNote({ collapsible, title = 'Why an account, and what stays on your phone' }: { collapsible?: boolean; title?: string }) {
  const c = usePalette();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(!collapsible);

  const list = (
    <View style={{ gap: 12 }}>
      {POINTS.map((p) => (
        <View key={p.title} style={{ flexDirection: 'row', gap: 10 }}>
          <Icon name={p.icon} size={16} color={c.mut} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.mut, lineHeight: 17 }}>{p.title}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 1, lineHeight: 17 }}>{p.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  if (!collapsible) return list;

  return (
    <View>
      <Press onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <Icon name="information-outline" size={16} color={c.mut} />
        <Text style={{ flex: 1, fontFamily: font.medium, fontSize: 12.5, color: c.mut }}>{title}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.mut} />
      </Press>
      {open ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={{ marginTop: 10 }}>
          {list}
        </Animated.View>
      ) : null}
    </View>
  );
}
