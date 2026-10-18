import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { Back, buzz, Icon, Press, TagPicker, Toggle, usePalette, Word } from '@/components/ui';
import { inr } from '@/lib/format';
import { guessRail, readMoney } from '@/lib/parser';
import { useStore } from '@/lib/store';
import { font, RAIL_ICON, RAIL_LABEL } from '@/lib/theme';

export default function Review() {
  const c = usePalette();
  const router = useRouter();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string; file?: string }>();
  const want = typeof params.id === 'string' ? params.id : undefined;
  const file = typeof params.file === 'string' ? params.file : undefined;
  const cur = store.queue[0];
  const [tag, setTag] = useState<string | null>(cur?.tag ?? null);
  const [groupOn, setGroupOn] = useState(false);
  const [groupId, setGroupId] = useState('quick');
  const groups = store.groups.filter((g) => g.kind !== 'split');
  const [reflect, setReflect] = useState(true);
  const [paste, setPaste] = useState('');
  const [seenId, setSeenId] = useState(cur?.id);
  const [amountAt, setAmountAt] = useState<number | null>(null);
  const [merchantAt, setMerchantAt] = useState<number | null>(null);
  const [pick, setPick] = useState<'amount' | 'merchant'>('amount');

  if (cur && cur.id !== seenId) {
    setSeenId(cur.id);
    setTag(cur.tag);
    const words = cur.body.split(/\s+/).filter(Boolean);
    const hit = words.findIndex((w) => readMoney(w) != null);
    setAmountAt(hit >= 0 ? hit : null);
    setMerchantAt(null);
    setPick(hit >= 0 ? 'merchant' : 'amount');
    const learned = store.rules.find((r) => r.key === cur.merchant.toLowerCase());
    setGroupOn(Boolean(learned?.groupId) || (want === cur.id && file === 'split'));
    if (learned?.groupId) setGroupId(learned.groupId);
  }

  useEffect(() => {
    if (want) store.focusDraft(want);
  }, [want, store]);

  const confirm = () => {
    if (!cur) return;
    const chosen = tag;
    if (groupOn && groupId === 'quick') {
      store.remember(cur.merchant, chosen, null);
      router.push({ pathname: '/quick-split', params: { draftId: cur.id, tag: chosen ?? '' } });
      return;
    }
    if (groupOn && groups.some((g) => g.id === groupId)) {
      store.remember(cur.merchant, chosen, groupId);
      router.push({ pathname: '/split', params: { groupId, draftId: cur.id, reflect: reflect ? '1' : '0', tag: chosen ?? '' } });
      return;
    }
    buzz('done');
    store.remember(cur.merchant, chosen, groupOn && groupId !== 'quick' ? groupId : null);
    store.confirmDraft(cur.id, { tag: chosen, groupId: groupOn && groupId !== 'quick' ? groupId : null });
    store.flash(cur.transfer ? 'Card bill saved. Not counted as spend.' : 'Saved');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 4 }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
        <Back />
        <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }}>Review SMS</Text>
        <Text style={{ width: 44, textAlign: 'center', fontFamily: font.body, color: c.mut }}>{store.queue.length}</Text>
      </View>
      {!cur ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check-all" size={32} />
          </View>
          <Word size={28} style={{ marginTop: 22 }}>All caught up</Word>
          <Text style={{ fontFamily: font.body, color: c.mut, textAlign: 'center', marginTop: 8, lineHeight: 21 }}>New messages will appear here as they arrive.</Text>
          <Input value={paste} onChangeText={setPaste} placeholder="Paste a bank SMS" label="Bank SMS" caps="none" multiline style={{ marginTop: 24, width: '100%', minHeight: 80, borderRadius: 14, backgroundColor: c.sub, padding: 12, color: c.fg, fontFamily: font.mono, fontSize: 12 }} />
          <Press onPress={() => { if (store.ingestText(paste)) { setPaste(''); store.flash('Parsed'); } else store.flash('That does not look like a bank debit or credit.'); }} style={{ marginTop: 12, height: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.medium, color: c.fg }}>Parse message</Text>
          </Press>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {store.queue.slice(0, 8).map((d, i) => <View key={d.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === 0 ? c.acc : c.bar }} />)}
          </View>
          <Animated.View key={cur.id} entering={reduce ? FadeIn.duration(160) : FadeInRight.duration(300).easing(Easing.out(Easing.exp))}>
          <View style={{ marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: c.sub }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontFamily: font.mono, fontSize: 11, color: c.mut }}>{cur.sender}</Text>
              <Text style={{ fontFamily: font.mono, fontSize: 11, color: c.mut }}>{cur.bank}</Text>
            </View>
            <Text style={{ fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: c.mut }}>{cur.body}</Text>
          </View>
          {cur.amount <= 0 ? (
            <FormatPick
              body={cur.body}
              sender={cur.sender}
              amountAt={amountAt}
              merchantAt={merchantAt}
              pick={pick}
              onPick={setPick}
              onTap={(i) => {
                buzz();
                if (pick === 'amount') {
                  if (amountAt === i) setAmountAt(null);
                  else {
                    setAmountAt(i);
                    if (merchantAt === i) setMerchantAt(null);
                    setPick('merchant');
                  }
                } else if (merchantAt === i) setMerchantAt(null);
                else {
                  setMerchantAt(i);
                  if (amountAt === i) setAmountAt(null);
                }
              }}
              onSkip={() => setMerchantAt(null)}
              onSave={() => {
                const words = cur.body.split(/\s+/).filter(Boolean);
                const amount = amountAt == null ? '' : words[amountAt];
                const merchant = merchantAt == null ? '' : words[merchantAt];
                if (store.teach(cur.id, amount, merchant)) store.flash('Format saved');
                else store.flash('Tap the chip that contains the amount');
              }}
            />
          ) : (
          <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 24 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.semi, fontSize: 20, color: c.fg }}>{cur.merchant}</Text>
              <View style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: c.sub }}>
                <Icon name={RAIL_ICON[cur.rail]} size={16} />
                <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.fg }}>{RAIL_LABEL[cur.rail]}{cur.transfer ? ' · card bill' : ''}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: font.display, fontSize: 40, color: cur.income ? c.pos : c.fg }}>{cur.income ? '+' : '−'}₹{inr(cur.amount)}</Text>
          </View>
          <Text style={{ marginTop: 22, marginBottom: 10, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>TAG</Text>
          <TagPicker value={tag} onChange={setTag} />

          {!cur.income && !cur.transfer ? (
            <View style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: c.sub }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }}>Split this</Text>
                  <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>Only your share counts as spend. The rest shows as coming back.</Text>
                </View>
                <Toggle on={groupOn} onPress={() => setGroupOn((v) => !v)} />
              </View>
              {groupOn ? (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[{ id: 'quick', name: 'Quick split' }, ...groups].map((g) => {
                      const on = g.id === groupId;
                      return (
                        <Press key={g.id} onPress={() => setGroupId(g.id)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{g.name}</Text>
                        </Press>
                      );
                    })}
                  </View>
                  {groupId === 'quick' ? (
                    <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 12, lineHeight: 18 }}>Pick who shared it on the next screen. It becomes a small split, not a group.</Text>
                  ) : (
                    <Press onPress={() => setReflect((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: reflect ? c.acc : c.line, backgroundColor: reflect ? c.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {reflect ? <Icon name="check" size={14} color={c.accFg} /> : null}
                      </View>
                      <Text style={{ fontFamily: font.body, fontSize: 14, color: c.fg }}>Reflect my share in personal expenses</Text>
                    </Press>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
          </>
          )}
          </Animated.View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28 }}>
            <Press onPress={() => store.ignoreDraft(cur.id)}><Text style={{ fontFamily: font.medium, color: c.mut, fontSize: 14 }}>Not an expense</Text></Press>
            <View style={{ flex: 1 }} />
            <Press onPress={() => store.skipDraft(cur.id)} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="redo" size={22} />
            </Press>
            <Press onPress={confirm} style={{ height: 52, paddingHorizontal: 22, borderRadius: 26, backgroundColor: c.acc, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={18} color={c.accFg} />
              <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 15 }}>Confirm</Text>
            </Press>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function FormatPick({
  body, sender, amountAt, merchantAt, pick, onPick, onTap, onSkip, onSave,
}: {
  body: string;
  sender: string;
  amountAt: number | null;
  merchantAt: number | null;
  pick: 'amount' | 'merchant';
  onPick: (p: 'amount' | 'merchant') => void;
  onTap: (i: number) => void;
  onSkip: () => void;
  onSave: () => void;
}) {
  const c = usePalette();
  const words = body.split(/\s+/).filter(Boolean);
  const amount = amountAt == null ? null : readMoney(words[amountAt] ?? '');
  const rail = guessRail(body);
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.fg }}>This format is new</Text>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 4, lineHeight: 18 }}>
        The amount is marked when the chip is filled. Tap it again to clear it. Merchant can be skipped. Next {sender} message uses this shape.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {(['amount', 'merchant'] as const).map((id) => {
          const on = pick === id;
          return (
            <Press key={id} onPress={() => onPick(id)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: on ? c.acc : c.sub, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>{id === 'amount' ? 'Pick amount' : 'Pick merchant'}</Text>
            </Press>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {words.map((word, i) => {
          const kind = i === amountAt ? 'amount' : i === merchantAt ? 'merchant' : '';
          return (
            <Press key={`${word}-${i}`} onPress={() => onTap(i)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: kind ? c.acc : c.line, backgroundColor: kind ? c.acc : 'transparent' }}>
              <Text style={{ fontFamily: font.mono, fontSize: 12, color: kind ? c.accFg : c.fg }}>{word}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={{ fontFamily: font.mono, fontSize: 12, color: c.mut, marginTop: 12 }}>
        Amount: {amount ? `₹${inr(amount)}` : '—'} · Merchant: {merchantAt == null ? 'skipped' : words[merchantAt]} · {RAIL_LABEL[rail]}
      </Text>
      {merchantAt != null ? (
        <Press onPress={onSkip} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.fg }}>Skip merchant</Text>
        </Press>
      ) : null}
      <Press onPress={onSave} style={{ marginTop: 14, height: 44, borderRadius: 22, backgroundColor: amount ? c.acc : c.bar, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.medium, color: amount ? c.accFg : c.mut }}>Use this format</Text>
      </Press>
    </View>
  );
}
