import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Back, Body, Button, Ghost, Word, usePalette } from '@/components/ui';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const SKUS = ['kakei_pro_monthly', 'kakei_pro_yearly'];

type Plan = { id: string; title: string; price: string; trial: string | null; offerToken: string | null };

export default function Pro() {
  const c = usePalette();
  const store = useStore();
  const live = useRef(store);
  useEffect(() => { live.current = store; });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    let off: { remove: () => void } | null = null;
    const run = async () => {
      const iap = await import('react-native-iap');
      const ok = await iap.initConnection();
      if (!ok || dead) return;
      off = iap.purchaseUpdatedListener((purchase) => {
        const token = purchase.purchaseToken;
        if (!token) return;
        live.current.confirmPlay(token, purchase.productId).then(async (err) => {
          if (err) { setError(err); return; }
          await iap.finishTransaction({ purchase, isConsumable: false });
          router.back();
        }).catch((err) => setError(err instanceof Error ? err.message : 'Could not verify the purchase'));
      });
      const products = await iap.fetchProducts({ skus: SKUS, type: 'subs' });
      if (dead || !products) return;
      setPlans(products.map((p) => {
        const offers = 'subscriptionOffers' in p ? p.subscriptionOffers ?? [] : [];
        const paid = offers.find((o) => o.paymentMode !== 'free-trial') ?? offers[0];
        const trial = offers.find((o) => o.paymentMode === 'free-trial');
        return {
          id: p.id,
          title: p.id === 'kakei_pro_yearly' ? 'Yearly' : 'Monthly',
          price: paid?.displayPrice || p.displayPrice,
          trial: trial ? 'Includes a free trial' : null,
          offerToken: paid?.offerTokenAndroid ?? offers[0]?.offerTokenAndroid ?? null,
        };
      }));
    };
    run().catch((err) => { if (!dead) setError(err instanceof Error ? err.message : 'Play Billing is unavailable'); });
    return () => {
      dead = true;
      off?.remove();
      void import('react-native-iap').then((iap) => iap.endConnection()).catch(() => {});
    };
  }, []);

  const buy = async (plan: Plan) => {
    setBusy(true);
    setError(null);
    try {
      const iap = await import('react-native-iap');
      await iap.requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [plan.id],
            subscriptionOffers: plan.offerToken ? [{ sku: plan.id, offerToken: plan.offerToken }] : undefined,
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the purchase');
    }
    setBusy(false);
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const iap = await import('react-native-iap');
      const purchases = await iap.getAvailablePurchases();
      const mine = purchases.find((p) => SKUS.includes(p.productId) && p.purchaseToken);
      if (!mine?.purchaseToken) {
        setError('Play has no Kakei subscription for this account');
        return;
      }
      const err = await live.current.confirmPlay(mine.purchaseToken, mine.productId);
      if (err) { setError(err); return; }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
      <Back to={() => router.back()} />
      <Word size={32} style={{ marginTop: 16 }}>Kakei Pro</Word>
      <Body color={c.mut} style={{ marginTop: 10, lineHeight: 22 }}>Backup, Ask, and a remote MCP. The price comes from Play.</Body>
      <View style={{ gap: 16, marginTop: 28 }}>
        {plans.map((plan) => (
          <View key={plan.id} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 16, gap: 8 }}>
            <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }}>{plan.title}</Text>
            <Text style={{ fontFamily: font.mono, fontSize: 15, color: c.fg }}>{plan.price}</Text>
            {plan.trial ? <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut }}>{plan.trial}</Text> : null}
            <Button label={busy ? 'One sec' : 'Buy'} onPress={() => buy(plan)} disabled={busy} />
          </View>
        ))}
      </View>
      {error ? <Text style={{ fontFamily: font.body, fontSize: 14, color: c.neg, marginTop: 16 }}>{error}</Text> : null}
      <View style={{ flex: 1, minHeight: 24 }} />
      <Ghost label="Restore a purchase" onPress={restore} />
    </ScrollView>
  );
}
