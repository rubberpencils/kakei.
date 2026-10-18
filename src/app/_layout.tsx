import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { KeyboardHost } from '@/components/keyboard';
import { McpHost } from '@/components/mcp-host';
import { Splash } from '@/components/splash';
import { ConfirmHost, Toast } from '@/components/ui';
import { StoreProvider, useStore } from '@/lib/store';
import { dark, font, light } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { ready, entered, lock } = useStore();
  const reduce = useReducedMotion();
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? dark.bg : light.bg;
  const [splash, setSplash] = useState(true);
  const done = useCallback(() => setSplash(false), []);
  const [unlocked, setUnlocked] = useState(!lock);

  useEffect(() => {
    if (!lock) setUnlocked(true);
  }, [lock]);

  const askUnlock = useCallback(async () => {
    const LocalAuthentication = await import('expo-local-authentication');
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Kakei.', cancelLabel: 'Cancel' });
    if (result.success) setUnlocked(true);
  }, []);

  useEffect(() => {
    if (lock && !unlocked && !splash) askUnlock();
  }, [lock, unlocked, splash, askUnlock]);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={splash ? 'light' : 'auto'} />
      <View style={{ flex: 1 }}>
      {ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: bg },
            animation: reduce ? 'fade' : 'slide_from_right',
          }}
        >
          <Stack.Protected guard={entered}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add" options={{ animation: reduce ? 'fade' : 'slide_from_bottom' }} />
            <Stack.Screen name="review" />
            <Stack.Screen name="split" />
            <Stack.Screen name="quick-split" />
            <Stack.Screen name="settle" />
            <Stack.Screen name="developer" />
            <Stack.Screen name="join" />
            <Stack.Screen name="new-group" />
            <Stack.Screen name="group/[id]" />
            <Stack.Screen name="expense/[id]" />
            <Stack.Screen name="person/[id]" />
            <Stack.Screen name="group-settings" />
            <Stack.Screen name="sms" />
            <Stack.Screen name="search" options={{ animation: reduce ? 'fade' : 'fade_from_bottom' }} />
            <Stack.Screen name="balances" />
            <Stack.Screen name="card-bill" />
          </Stack.Protected>
          <Stack.Protected guard={!entered}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
        </Stack>
      ) : null}
      {/* The keyboard sits under the screens, so they shrink to make room for it. */}
      <KeyboardHost />
      </View>
      <McpHost />
      <Toast />
      <ConfirmHost />
      {lock && !unlocked && !splash ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Text style={{ fontFamily: font.display, fontSize: 32, color: scheme === 'dark' ? dark.fg : light.fg }}>kakei.</Text>
          <Pressable onPress={askUnlock} style={{ height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: scheme === 'dark' ? dark.acc : light.acc, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semi, color: scheme === 'dark' ? dark.accFg : light.accFg }}>Unlock</Text>
          </Pressable>
        </View>
      ) : null}
      {splash ? <Splash ready={ready} onDone={done} /> : null}
    </View>
  );
}

export default function Root() {
  const [loaded] = useFonts({
    Syne_800ExtraBold,
    Syne_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </GestureHandlerRootView>
  );
}
