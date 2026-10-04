import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  FadeOutRight,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back, Body, Button, buzz, Field, Ghost, Icon, Press, Word, Wordmark, useDark, usePalette } from '@/components/ui';
import { readDeviceSms } from '@/lib/sms';
import { useStore } from '@/lib/store';
import { font, tagColors } from '@/lib/theme';
import { cleanVpa } from '@/lib/upi';

const FEATURES = [
  { icon: 'message-text-outline', title: 'Bank SMS, auto-read', body: 'Every debit alert is parsed on this phone. UPI, card, NEFT, IMPS, debit. You confirm each one.' },
  { icon: 'tag-outline', title: 'One tap to tag', body: 'Type to match a tag or create one. One tag per expense keeps it clean.' },
  { icon: 'account-group-outline', title: 'Split with anyone', body: 'Drop a spend into a group, pick who paid, and watch balances shrink as people settle.' },
];

const ease = Easing.out(Easing.exp);

export default function Onboarding() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const store = useStore();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const ios = Platform.OS === 'ios';

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const allow = async () => {
    if (ios) {
      go(3);
      return;
    }
    const result = await readDeviceSms();
    if (result.error === 'build') store.flash('Inbox reading needs the installed app. Paste messages in Review for now.');
    else if (result.error === 'denied') store.flash('SMS stays off until you allow it');
    else {
      const n = store.ingest(result.rows);
      store.setSmsOn(true);
      store.flash(n ? `${n} bank messages ready to review` : 'No bank messages yet');
    }
    go(3);
  };

  const enter = reduce ? FadeIn.duration(200) : (dir > 0 ? FadeInRight : FadeInLeft).duration(340).easing(ease);
  const exit = reduce ? undefined : (dir > 0 ? FadeOutLeft : FadeOutRight).duration(200);
  const rise = (i: number) => (reduce ? undefined : FadeInDown.delay(80 + i * 70).duration(420).easing(ease));

  return (
    <KeyboardAvoidingView behavior={ios ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: 28 }}>
        <Animated.View key={step} entering={enter} exiting={exit} style={{ flex: 1 }}>
          {step === 0 ? (
            <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: 36 }}>
              <Animated.View entering={rise(0)}>
                <Wordmark size={32} />
              </Animated.View>
              <View>
                <Demo reduce={reduce} />
                <Animated.View entering={rise(4)}>
                  <Word size={36} style={{ lineHeight: 40, marginTop: 28 }}>
                    Your bank already tracks <Text style={{ color: c.brand }}>every spend.</Text>
                  </Word>
                </Animated.View>
                <Animated.View entering={rise(5)}>
                  <Body color={c.mut} style={{ marginTop: 14, lineHeight: 24, fontSize: 16 }}>
                    kakie. reads those SMS alerts and turns them into a clean, split-ready ledger.
                  </Body>
                </Animated.View>
              </View>
              <Animated.View entering={rise(6)}>
                <Dots n={0} />
                <Button label="Get started" icon="arrow-right" onPress={() => go(1)} />
                <Ghost label="I already have an account" onPress={() => { setMode('login'); go(3); }} />
              </Animated.View>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={{ flex: 1 }}>
              <Back to={() => go(0)} />
              <View style={{ flex: 1, justifyContent: 'center', gap: 30 }}>
                {FEATURES.map((f, i) => <Feature key={f.title} f={f} i={i} reduce={reduce} />)}
              </View>
              <Dots n={1} />
              <Button label={ios ? 'Set up bank SMS' : 'Connect my bank SMS'} onPress={() => go(2)} />
              <Ghost label="I'll add manually" onPress={() => go(3)} />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={{ flex: 1 }}>
              <Back to={() => go(1)} />
              <Animated.View entering={rise(0)} style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center', marginTop: 20, transform: [{ rotate: '-6deg' }] }}>
                <Icon name="message-text-outline" size={26} color={c.brandInk} />
              </Animated.View>
              <Animated.View entering={rise(1)}>
                <Word size={32} style={{ marginTop: 20, lineHeight: 36 }}>{ios ? 'Set up with Shortcuts' : 'Connect bank SMS'}</Word>
                <Body color={c.mut} style={{ marginTop: 12, lineHeight: 22 }}>
                  {ios
                    ? 'iOS does not let apps read SMS. A one-time Shortcuts automation hands bank messages to kakie.'
                    : 'kakie. scans for bank transactions only. Personal chats are never accessed.'}
                </Body>
              </Animated.View>
              <ScrollView style={{ flex: 1, marginTop: 24 }} contentContainerStyle={{ gap: 20 }}>
                {ios ? (
                  <>
                    <StepRow i={2} reduce={reduce} n="01" title='New automation: Message contains "debited"' sub='Make two more for "credited" and "spent"' />
                    <StepRow i={3} reduce={reduce} n="02" title="Action: Open URL kakie://sms?text=" sub="Append the Shortcut Input message to the URL" />
                    <StepRow i={4} reduce={reduce} n="03" title="Turn on Run Immediately" sub="kakie. parses it here. You confirm before it is saved." />
                  </>
                ) : (
                  <>
                    <Note i={2} reduce={reduce} icon="lock-outline" title="Parsed on this phone" sub="Only amount, merchant, date, and rail are synced. The message text stays here." />
                    <Note i={3} reduce={reduce} icon="filter-outline" title="Transactional messages only" sub="Banks, cards, and wallets. OTPs and chats are skipped." />
                    <Note i={4} reduce={reduce} icon="check-circle-outline" title="You confirm every entry" sub="Nothing enters the ledger until you tap confirm." />
                  </>
                )}
              </ScrollView>
              <Dots n={2} />
              <Button label={ios ? 'Done, continue' : 'Allow SMS access'} onPress={allow} />
              <Ghost label="Skip for now" onPress={() => go(3)} />
            </View>
          ) : null}

          {step === 3 ? <Account mode={mode} setMode={setMode} back={() => go(2)} rise={rise} /> : null}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Account({
  mode, setMode, back, rise,
}: {
  mode: 'signup' | 'login';
  setMode: (m: 'signup' | 'login') => void;
  back: () => void;
  rise: (i: number) => ReturnType<typeof FadeInDown.delay> | undefined;
}) {
  const c = usePalette();
  const store = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [vpa, setVpa] = useState('');
  const [vpaError, setVpaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editServer, setEditServer] = useState(false);
  const [server, setServer] = useState(store.base);
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setVpaError(null);
    if (mode === 'signup' && !name.trim()) return setError('Add your name so friends recognise you');
    const upi = mode === 'signup' && vpa.trim() ? cleanVpa(vpa) : null;
    if (mode === 'signup' && vpa.trim() && !upi) return setVpaError('That does not look like a UPI ID. It has an @, like ananya@okaxis');
    setBusy(true);
    const err = mode === 'signup' ? await store.signUp(name, phone, pass, upi ?? undefined) : await store.signIn(phone, pass);
    setBusy(false);
    if (err) setError(err);
    else buzz('done');
  };

  const saveServer = async () => {
    setServerError(null);
    const err = await store.setBase(server);
    if (err) setServerError(err);
    else setEditServer(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <Back to={back} />
      <Animated.View entering={rise(0)}>
        <Word size={32} style={{ marginTop: 16, lineHeight: 36 }}>{mode === 'signup' ? 'Make your account' : 'Welcome back'}</Word>
        <Body color={c.mut} style={{ marginTop: 10, lineHeight: 22 }}>
          {mode === 'signup' ? 'Your phone number is how friends find you in groups.' : 'Log in with the phone number you signed up with.'}
        </Body>
      </Animated.View>
      <Animated.View entering={rise(1)} style={{ gap: 16, marginTop: 28 }}>
        {mode === 'signup' ? <Field label="Name" value={name} onChange={setName} placeholder="Ananya Rao" auto="words" /> : null}
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="98765 43210" keyboard="phone-pad" />
        <Field label="Password" value={pass} onChange={setPass} placeholder="At least 6 characters" secure error={error} />
        {mode === 'signup' ? (
          <Field
            label="UPI ID (optional)"
            value={vpa}
            onChange={setVpa}
            placeholder="ananya@okaxis"
            keyboard="email-address"
            error={vpaError}
            hint="Lets friends in your groups pay you in one tap. Leave it empty to settle by hand. You can add it later in Profile."
          />
        ) : null}
      </Animated.View>
      <Animated.View entering={rise(2)} style={{ marginTop: 20 }}>
        {editServer ? (
          <View style={{ gap: 10 }}>
            <Field label="Server address" value={server} onChange={setServer} placeholder="http://192.168.1.20:4000" keyboard="url" error={serverError} />
            <Press onPress={saveServer} style={{ alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 13 }}>Test and use</Text>
            </Press>
          </View>
        ) : (
          <Press onPress={() => setEditServer(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="server-network" size={16} color={c.mut} />
            <Text style={{ fontFamily: font.mono, fontSize: 12, color: c.mut, flex: 1 }} numberOfLines={1}>{store.base.replace(/^https?:\/\//, '')}</Text>
            <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.fg }}>Change</Text>
          </Press>
        )}
      </Animated.View>
      <View style={{ flex: 1, minHeight: 24 }} />
      <Dots n={3} />
      <Button label={busy ? 'One sec' : mode === 'signup' ? 'Create account' : 'Log in'} onPress={submit} disabled={busy} />
      <Ghost
        label={mode === 'signup' ? 'I already have an account' : 'New here? Make an account'}
        onPress={() => { setError(null); setMode(mode === 'signup' ? 'login' : 'signup'); }}
      />
    </ScrollView>
  );
}

type Seg = { t: string; k?: 1 | 2 | 3 };
const SAMPLES: { sender: string; body: Seg[]; merchant: string; meta: string; amount: string; income?: boolean; tag: string; icon: string }[] = [
  {
    sender: 'VM-HDFCBK',
    body: [{ t: 'Rs.1,240.00', k: 1 }, { t: ' debited from A/c XX4521 to VPA ' }, { t: 'swiggy@icici', k: 2 }, { t: '. ' }, { t: 'UPI', k: 3 }, { t: ' Ref 4267812.' }],
    merchant: 'Swiggy', meta: 'UPI · HDFC ••4521', amount: '₹1,240', tag: 'food', icon: 'qrcode',
  },
  {
    sender: 'AX-ICICIT',
    body: [{ t: 'INR 386.00', k: 1 }, { t: ' spent on ICICI Bank ' }, { t: 'Credit Card', k: 3 }, { t: ' XX9012 at ' }, { t: 'UBER INDIA', k: 2 }, { t: ' on 03-Oct.' }],
    merchant: 'Uber', meta: 'Credit card · ICICI ••9012', amount: '₹386', tag: 'transport', icon: 'credit-card-outline',
  },
  {
    sender: 'JD-SBIINB',
    body: [{ t: 'Your A/c XX7730 is credited by ' }, { t: 'Rs.52,000.00', k: 1 }, { t: ' via ' }, { t: 'NEFT', k: 3 }, { t: ' from ' }, { t: 'MERIDIAN LABS', k: 2 }, { t: '.' }],
    merchant: 'Meridian Labs', meta: 'NEFT · SBI ••7730', amount: '₹52,000', income: true, tag: 'salary', icon: 'bank-transfer-in',
  },
];

// phase: 0 message in, 1-3 tokens read, 4 parsed row, 5 tag
const BEATS = [700, 380, 380, 420, 380, 2600];

function Demo({ reduce }: { reduce: boolean }) {
  const c = usePalette();
  const isDark = useDark();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState(reduce ? 5 : 0);
  const shown = reduce ? 5 : phase;

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      if (phase < 5) setPhase(phase + 1);
      else {
        setIdx((i) => (i + 1) % SAMPLES.length);
        setPhase(0);
      }
    }, BEATS[phase]);
    return () => clearTimeout(t);
  }, [phase, reduce]);

  const s = SAMPLES[idx];
  const tag = tagColors(s.tag, isDark);
  const soft = Easing.bezier(0.22, 1, 0.36, 1);
  return (
    <View style={{ height: 196 }}>
      <Animated.View key={idx} entering={reduce ? undefined : FadeInDown.duration(560).easing(soft)} exiting={reduce ? undefined : FadeOut.duration(260)}>
        <View style={{ alignSelf: 'flex-start', maxWidth: '90%', backgroundColor: c.sub, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 15, paddingVertical: 13 }}>
          <Text style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 0.4, color: c.mut, marginBottom: 6 }}>{s.sender}</Text>
          <Text style={{ fontFamily: font.mono, fontSize: 12.5, color: c.fg, lineHeight: 19 }}>
            {s.body.map((seg, i) => {
              const lit = seg.k && shown >= seg.k;
              return (
                <Text key={i} style={lit ? { color: c.brandInk, backgroundColor: c.brandSoft } : undefined}>
                  {seg.t}
                </Text>
              );
            })}
          </Text>
        </View>

        {shown >= 4 ? (
          <Animated.View entering={reduce ? undefined : FadeInDown.duration(480).easing(soft)} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginLeft: 2 }}>
              <Icon name="auto-fix" size={13} color={c.brand} />
              <Text style={{ fontFamily: font.medium, fontSize: 11.5, color: c.brand }}>Read by kakie.</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={20} color={c.brandFg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semi, fontSize: 16, color: c.fg }}>{s.merchant}</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>{s.meta}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontFamily: font.displaySm, fontSize: 17, color: s.income ? c.pos : c.fg }}>{s.income ? '+' : '−'}{s.amount}</Text>
                {shown >= 5 ? (
                  <Animated.View entering={reduce ? undefined : FadeIn.duration(320)} style={{ backgroundColor: tag.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 11, color: tag.fg }}>#{s.tag}</Text>
                  </Animated.View>
                ) : (
                  <View style={{ height: 19 }} />
                )}
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const TILT = ['-6deg', '5deg', '-3deg'];

function Feature({ f, i, reduce }: { f: (typeof FEATURES)[number]; i: number; reduce: boolean }) {
  const c = usePalette();
  const solid = i === 0;
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(120 + i * 90).duration(440).easing(ease)} style={{ flexDirection: 'row', gap: 18 }}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: solid ? c.brand : c.brandSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: TILT[i] }] }}>
        <Icon name={f.icon} size={24} color={solid ? c.brandFg : c.brandInk} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.semi, fontSize: 17, color: c.fg, marginBottom: 4 }}>{f.title}</Text>
        <Body color={c.mut} style={{ lineHeight: 21, fontSize: 14 }}>{f.body}</Body>
      </View>
    </Animated.View>
  );
}

function Dots({ n }: { n: number }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: 24 }}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View
          key={i}
          entering={i === n ? FadeIn.duration(200) : undefined}
          style={{ width: i === n ? 22 : 5, height: 5, borderRadius: 3, backgroundColor: i === n ? c.brand : c.bar }}
        />
      ))}
    </View>
  );
}

function StepRow({ n, title, sub, i, reduce }: { n: string; title: string; sub: string; i: number; reduce: boolean }) {
  const c = usePalette();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(80 + i * 70).duration(420).easing(ease)} style={{ flexDirection: 'row', gap: 16 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 12, color: c.mut, width: 22, paddingTop: 2 }}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 3, lineHeight: 18 }}>{sub}</Text>
      </View>
    </Animated.View>
  );
}

function Note({ icon, title, sub, i, reduce }: { icon: string; title: string; sub: string; i: number; reduce: boolean }) {
  const c = usePalette();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(80 + i * 70).duration(420).easing(ease)} style={{ flexDirection: 'row', gap: 14 }}>
      <Icon name={icon} size={20} color={c.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13.5, color: c.mut, marginTop: 3, lineHeight: 19 }}>{sub}</Text>
      </View>
    </Animated.View>
  );
}
