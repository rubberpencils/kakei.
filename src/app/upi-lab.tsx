import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back, Press, usePalette, Word } from '@/components/ui';
import { maskVpa } from '@/lib/upi';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const GPAY = 'com.google.android.apps.nbu.paisa.user';

// Debug screen: tries link variants against real UPI apps and shows their raw replies.
export default function UpiLab() {
  const { to, am } = useLocalSearchParams<{ to: string; am: string }>();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const payee = store.people.find((p) => p.id === to);
  const [out, setOut] = useState<Record<string, string>>({});
  const vpa = payee?.vpa;
  if (!payee || !vpa) return null;

  const amount = Number(am || 1).toFixed(2);
  const pn = encodeURIComponent(payee.name);
  const tn = encodeURIComponent('Kakie test');
  const base = `upi://pay?pa=${vpa}`;
  const variants = [
    { id: 'now', label: 'Current link', uri: `${base}&am=${amount}&cu=INR&tn=${tn}` },
    { id: 'pn', label: 'With name', uri: `${base}&pn=${pn}&am=${amount}&cu=INR` },
    { id: 'noam', label: 'Name, no amount', uri: `${base}&pn=${pn}&cu=INR` },
    { id: 'bare', label: 'UPI ID only', uri: base },
  ];

  const run = async (key: string, uri: string, pkg: string | null) => {
    setOut((o) => ({ ...o, [key]: 'waiting' }));
    try {
      const mod = await import('../../modules/kakie-sms');
      const raw = await mod.payUpi(uri, pkg);
      setOut((o) => ({ ...o, [key]: raw || '(no reply: backed out, or the app sent nothing)' }));
    } catch (e) {
      setOut((o) => ({ ...o, [key]: `error: ${String(e)}` }));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }}>
      <Back />
      <Word size={24}>UPI link test</Word>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 6, lineHeight: 19 }}>
        To {maskVpa(vpa)}. Each try is a real payment of ₹{amount}. Nothing is recorded here, so mark a successful one as paid on the settle screen.
      </Text>
      {variants.map((v) => (
        <View key={v.id} style={{ marginTop: 20, padding: 16, borderRadius: 18, backgroundColor: c.sub }}>
          <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>{v.label}</Text>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: c.mut, marginTop: 4 }}>{v.uri.replace(vpa, maskVpa(vpa))}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {([['chooser', null], ['Google Pay', GPAY]] as const).map(([name, pkg]) => {
              const key = `${v.id}|${name}`;
              return (
                <View key={key} style={{ flex: 1 }}>
                  <Press onPress={() => run(key, v.uri, pkg)} style={{ height: 38, borderRadius: 19, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.accFg }}>{name}</Text>
                  </Press>
                  {out[key] ? <Text selectable style={{ fontFamily: font.mono, fontSize: 10.5, color: c.fg, marginTop: 6 }}>{out[key]}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
