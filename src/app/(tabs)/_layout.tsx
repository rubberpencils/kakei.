import { Tabs, usePathname, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Press, usePalette } from '@/components/ui';
import { useKeyboard } from '@/lib/keyboard';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const TABS = [
  { name: 'index', label: 'Home', icon: 'home-outline', on: 'home' },
  { name: 'personal', label: 'Personal', icon: 'wallet-outline', on: 'wallet' },
  { name: 'groups', label: 'Groups', icon: 'account-group-outline', on: 'account-group' },
  { name: 'insights', label: 'Insights', icon: 'chart-donut', on: 'chart-donut' },
  { name: 'profile', label: 'Profile', icon: 'account-outline', on: 'account' },
];

function Bar({
  state,
  navigation,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  // The keyboard already reserves the bottom safe area, so the bar must not add it a second time.
  const { field } = useKeyboard();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.faint, backgroundColor: c.bg, paddingTop: 6, paddingBottom: field ? 8 : Math.max(insets.bottom, 8) }}>
      {state.routes.map((route, i) => {
        const tab = TABS.find((t) => t.name === route.name) ?? TABS[0];
        const focused = state.index === i;
        return (
          <Press key={route.key} onPress={() => navigation.navigate(route.name)} style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 48 }}>
            <Icon name={focused ? tab.on : tab.icon} size={24} color={focused ? c.fg : c.mut} />
            <Text style={{ fontSize: 10.5, fontFamily: font.medium, color: focused ? c.fg : c.mut }}>{tab.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const path = usePathname();
  const { groups } = useStore();
  const showFab = path === '/' || path.endsWith('/personal') || path.endsWith('/groups');
  const bottom = Math.max(insets.bottom, 8) + 62;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => (
        <Bar state={props.state} navigation={{ navigate: (name) => props.navigation.navigate(name) }} />
      )}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="personal" />
        <Tabs.Screen name="groups" />
        <Tabs.Screen name="insights" />
        <Tabs.Screen name="profile" />
      </Tabs>
      {showFab ? (
        <Press
          onPress={() => {
            if (path.endsWith('/groups')) {
              if (!groups.length) router.push('/new-group');
              else router.push({ pathname: '/split', params: { groupId: groups[0].id } });
            } else router.push('/add');
          }}
          style={{ position: 'absolute', right: 20, bottom, width: 56, height: 56, borderRadius: 28, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="plus" size={28} color={c.accFg} />
        </Press>
      ) : null}
    </View>
  );
}
