import { Text, View } from 'react-native';

import { Icon, usePalette } from '@/components/ui';
import { font } from '@/lib/theme';

const POINTS = [
  { icon: 'cellphone-lock', title: 'Your money stays on this phone', body: 'Spends, budget, tags and bank SMS are stored here. They are never uploaded.' },
  { icon: 'account-group-outline', title: 'Why there is a server', body: 'Only groups you share go to it, so friends see the same balances. It passes them between phones and keeps nothing else.' },
  { icon: 'lock-outline', title: 'Encrypted and private', body: 'Shared data travels over HTTPS and is stored encrypted. Passwords are hashed.' },
  { icon: 'wifi-off', title: 'Works without it', body: 'If the server is down or you are offline, Kakei keeps working and catches up later.' },
];

/** What lives on the phone, what goes to the server and why. Shown on sign-in and in Profile. */
export function PrivacyNote() {
  const c = usePalette();
  return (
    <View style={{ gap: 16 }}>
      {POINTS.map((p) => (
        <View key={p.title} style={{ flexDirection: 'row', gap: 14 }}>
          <Icon name={p.icon} size={20} color={c.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }}>{p.title}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 2, lineHeight: 18 }}>{p.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
