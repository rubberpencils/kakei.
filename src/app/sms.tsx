import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useStore } from '@/lib/store';

export default function SmsLink() {
  const { text, sender } = useLocalSearchParams<{ text?: string; sender?: string }>();
  const { ingestText, flash } = useStore();
  const router = useRouter();

  useEffect(() => {
    const ok = text ? ingestText(String(text), sender ? String(sender) : undefined) : false;
    if (!ok) flash('That message is not a bank debit or credit');
    router.replace(ok ? '/review' : '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
