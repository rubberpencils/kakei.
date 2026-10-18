import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Back, Body, Button, Field, Word, usePalette } from '@/components/ui';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

export default function Ask() {
  const c = usePalette();
  const store = useStore();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setNote(null);
    try {
      setAnswer(await store.askQuestion(question));
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not ask');
    }
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
      <Back to={() => router.back()} />
      <Word size={32} style={{ marginTop: 16 }}>Ask</Word>
      <Body color={c.mut} style={{ marginTop: 10, lineHeight: 22 }}>
        The question and the numbers a tool returns are sent to Google. SMS text is not. This uses the paid API, and it shares a limit of 30 answers a month with the Sunday digest.
      </Body>
      {store.askOk ? (
        <View style={{ gap: 16, marginTop: 28 }}>
          <Field label="Question" value={q} onChange={setQ} placeholder="What did I spend on food?" />
          {answer ? <Text style={{ fontFamily: font.body, fontSize: 15, lineHeight: 22, color: c.fg }}>{answer}</Text> : null}
          {note ? <Text style={{ fontFamily: font.body, fontSize: 14, color: c.neg }}>{note}</Text> : null}
        </View>
      ) : (
        <Body color={c.mut} style={{ marginTop: 20 }}>{note}</Body>
      )}
      <View style={{ flex: 1, minHeight: 24 }} />
      <Button
        label={busy ? 'One sec' : store.askOk ? 'Ask' : 'Allow Ask'}
        onPress={store.askOk ? send : async () => setNote(await store.allowAsk())}
        disabled={busy}
      />
    </ScrollView>
  );
}
