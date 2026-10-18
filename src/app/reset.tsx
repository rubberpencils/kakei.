import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { Back, Body, Button, Field, Ghost, Word, usePalette } from '@/components/ui';
import { useStore } from '@/lib/store';

export default function Reset() {
  const c = usePalette();
  const store = useStore();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = async () => {
    setError(null);
    setBusy(true);
    const err = await store.requestCode(phone, 'reset');
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const err = await store.resetPassword(phone, code, pass);
    setBusy(false);
    if (err) setError(err);
    else setDone(true);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
      <Back to={() => router.back()} />
      <Word size={32} style={{ marginTop: 16, lineHeight: 36 }}>Reset password</Word>
      <Body color={c.mut} style={{ marginTop: 10, lineHeight: 22 }}>
        {done ? 'Password updated. Log in with the new one.' : 'We text a code to the phone on the account. A self-hosted server prints that code in its log.'}
      </Body>
      {done ? null : (
        <View style={{ gap: 16, marginTop: 28 }}>
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="98765 43210" keyboard="phone-pad" />
          <Field label="Code" value={code} onChange={setCode} placeholder="6 digits" keyboard="number-pad" />
          <Field label="New password" value={pass} onChange={setPass} placeholder="At least 6 characters" secure error={error} />
          <Ghost label={sent ? 'Send the code again' : 'Send a code'} onPress={send} />
        </View>
      )}
      <View style={{ flex: 1, minHeight: 24 }} />
      <Button label={busy ? 'One sec' : done ? 'Back to log in' : 'Update password'} onPress={done ? () => router.back() : submit} disabled={busy} />
    </ScrollView>
  );
}
