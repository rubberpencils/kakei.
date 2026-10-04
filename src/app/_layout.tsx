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
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { Splash } from '@/components/splash';
import { ConfirmHost, Toast } from '@/components/ui';
import { StoreProvider, useStore } from '@/lib/store';
import { dark, light } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { ready, signedIn } = useStore();
  const reduce = useReducedMotion();
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? dark.bg : light.bg;
  const [splash, setSplash] = useState(true);
  const done = useCallback(() => setSplash(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={splash ? 'light' : 'auto'} />
      {ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: bg },
            animation: reduce ? 'fade' : 'slide_from_right',
          }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add" options={{ presentation: 'modal', animation: reduce ? 'fade' : 'slide_from_bottom' }} />
            <Stack.Screen name="review" />
            <Stack.Screen name="split" />
            <Stack.Screen name="settle" />
            <Stack.Screen name="upi-lab" />
            <Stack.Screen name="join" />
            <Stack.Screen name="new-group" />
            <Stack.Screen name="group/[id]" />
            <Stack.Screen name="expense/[id]" />
            <Stack.Screen name="person/[id]" />
            <Stack.Screen name="group-settings" />
            <Stack.Screen name="sms" />
            <Stack.Screen name="search" options={{ animation: reduce ? 'fade' : 'fade_from_bottom' }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
        </Stack>
      ) : null}
      <Toast />
      <ConfirmHost />
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
