import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { PrivacyNote } from '@/components/privacy';
import { ask, Avatar, Icon, Press, Word, usePalette } from '@/components/ui';
import { serverName } from '@/lib/api';
import { accountsFrom } from '@/lib/ledger';
import { askNotify } from '@/lib/notify';
import { shareCsv, shareJson, sharePdf } from '@/lib/export';
import { readDeviceSms, showTestSms } from '@/lib/sms';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

export default function Profile() {
  const c = usePalette();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(store.you.name);
  const [budget, setBudget] = useState(store.budget ? String(store.budget) : '');
  const accounts = accountsFrom(store.expenses);
  const scan = async () => {
    const result = await readDeviceSms();
    if (result.error === 'ios') return store.flash(Platform.OS === 'ios' ? 'On iOS, bank SMS arrive through Shortcuts' : 'Inbox reading works in the Android app');
    if (result.error === 'denied') return store.flash('SMS permission was not granted');
    if (result.error === 'build') return store.flash('Inbox reading needs the installed app. Paste messages in Review.');
    const n = store.ingest(result.rows);
    store.setSmsOn(true);
    await askNotify();
    store.flash(n ? `${n} new bank messages` : 'No new bank messages');
    if (n) router.push('/review');
  };

  const signOut = () => {
    if (!store.signedIn) {
      ask({ title: 'Erase everything on this phone?', body: 'Your expenses, splits and groups are deleted. Nothing is stored anywhere else, so this cannot be undone.', confirm: 'Erase', destructive: true, still: true, onConfirm: store.signOut });
      return;
    }
    const keep = 'Your own spends, budget and tags stay on this phone. Shared groups leave it, and come back when you log in again.';
    const msg = store.pending ? `${keep} ${store.pending} group changes have not reached the server and will be lost.` : keep;
    ask({ title: 'Sign out?', body: msg, confirm: 'Sign out', destructive: true, onConfirm: store.signOut });
  };

  const syncLine = store.sync === 'syncing'
    ? 'Syncing'
    : store.sync === 'offline'
      ? `Offline${store.pending ? `, ${store.pending} changes waiting` : ''}`
      : store.syncedAt
        ? `Synced ${new Date(store.syncedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
        : 'Not synced yet';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 120 }}>
      <Word size={28}>Profile</Word>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 }}>
        <Avatar id={store.you.id} label={store.you.initials} size={64} you />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Input value={name} onChangeText={setName} onBlur={() => store.setName(name)} label="Your name" caps="words" style={{ flex: 1, fontFamily: font.semi, fontSize: 19, color: c.fg, padding: 0 }} />
            {store.signedIn && store.pro ? (
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: c.acc, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semi, fontSize: 11, color: c.accFg }}>Pro</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: font.mono, fontSize: 12.5, color: c.mut, marginTop: 4 }}>{store.signedIn ? store.phone : 'On this phone only'}</Text>
        </View>
      </View>
      <Press onPress={() => router.push({ pathname: '/person/[id]', params: { id: store.you.id } })} style={{ marginTop: 12 }}>
        <Row icon="format-list-bulleted" title="Your activity" sub="Every expense and payment you are part of">
          <Icon name="chevron-right" size={20} color={c.mut} />
        </Row>
      </Press>

      <Label>SMS import</Label>
      <Row icon="message-text-outline" title="Read bank SMS" sub={store.smsOn ? 'A bank message can be filed as soon as it arrives.' : 'Off'}>
        <Switch value={store.smsOn} onValueChange={(on) => { store.setSmsOn(on); if (on) scan(); }} trackColor={{ true: c.acc, false: c.bar }} />
      </Row>
      <Press onPress={scan}>
        <Row icon="refresh" title="Scan inbox now" />
      </Press>
      {Platform.OS === 'android' ? (
        <Press onPress={() => { store.setSmsOn(true); showTestSms().catch(() => store.flash('The installed app cannot post a test yet')); }}>
          <Row icon="bell-outline" title="Send a test notification" sub="File, Other, and Not mine, without a real bank text" />
        </Press>
      ) : null}
      {accounts.length ? null : (
        <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, lineHeight: 18, marginTop: 4 }}>
          Accounts and cards appear here by themselves. Kakei reads the bank name and last four digits from each bank SMS you confirm.
        </Text>
      )}
      {accounts.map((a) => (
        <Row key={`${a.bank}${a.account}`} icon={a.credit ? 'credit-card-outline' : 'bank-outline'} title={`${a.bank} ••${a.account}`} sub={a.credit ? 'Card' : 'Account'}>
          <Text style={{ fontFamily: font.mono, color: c.mut, fontSize: 13 }}>{a.count}</Text>
        </Row>
      ))}

      <Label>Budget</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.display, fontSize: 22, color: c.mut }}>₹</Text>
        <Input
          value={budget}
          onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
          mode="number"
          label="Monthly budget"
          placeholder="60000"
          onBlur={() => store.setBudget(Number(budget) || 0)}
          style={{ flex: 1, fontFamily: font.displaySm, fontSize: 28, color: c.fg, padding: 0 }}
        />
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut }}>One number for the month. Spend under it is savings.</Text>
      <TagBudgets />

      <Label>On this phone</Label>
      <Press onPress={() => shareCsv(store.expenses).catch(() => store.flash('Could not share the CSV'))}>
        <Row icon="file-delimited-outline" title="Export CSV" sub="Your expenses, on this phone" />
      </Press>
      <Press onPress={() => sharePdf(store.expenses).catch(() => store.flash('Could not share the PDF'))}>
        <Row icon="file-pdf-box" title="Export PDF" sub="A one-page list of your expenses" />
      </Press>
      <Row icon="fingerprint" title="Lock with biometrics" sub={store.lock ? 'On. Kakei asks before it opens' : 'Off'}>
        <Switch value={store.lock} onValueChange={store.setLock} trackColor={{ true: c.acc, false: c.bar }} />
      </Row>

      <Label>Sync and sharing</Label>
      {store.signedIn && store.pro ? (
        <>
          <Label>Backup</Label>
          <Row icon="cloud-lock-outline" title="On, with your account" sub="Sealed on this phone. Log in on a new phone and the ledger comes back. The server cannot read it." />
        </>
      ) : null}
      {store.signedIn && store.pro ? (
        <>
          <Press onPress={() => router.push('/ask' as never)}>
            <Row icon="comment-question-outline" title="Ask" sub={store.digest ? 'Sunday digest is on' : 'A question about this phone’s spending'} />
          </Press>
          <Row icon="calendar-week" title="Sunday digest" sub="One Pro answer each Sunday, from the same 30">
            <Switch value={store.digest} onValueChange={store.setDigest} trackColor={{ true: c.acc, false: c.bar }} />
          </Row>
        </>
      ) : null}
      {store.signedIn && !store.pro ? (
        <Press onPress={() => router.push('/pro' as never)}>
          <Row icon="star-outline" title="Kakei Pro" sub="Backup, Ask, and a remote MCP" />
        </Press>
      ) : null}
      {store.signedIn ? (
        <>
          <Row icon="server-network" title={serverName(store.base)} sub={syncLine}>
            <Press onPress={store.syncNow} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 12.5 }}>Sync now</Text>
            </Press>
          </Row>
        </>
      ) : (
        <>
          <Press onPress={store.connect}>
            <Row icon="account-sync-outline" title="Sync with friends" sub="Off. Everything stays on this phone">
              <Icon name="chevron-right" size={20} color={c.mut} />
            </Row>
          </Press>
        </>
      )}
      <Label>Where your data lives</Label>
      <PrivacyNote />

      <Label>Sample data</Label>
      {store.hasSample ? (
        <Press onPress={store.clearSample}>
          <Row icon="broom" title="Clear sample data" sub="Removes sample groups, expenses and SMS" />
        </Press>
      ) : (
        <Press onPress={store.loadSample}>
          <Row icon="flask-outline" title="Load sample data" sub="Three groups and a month of spends to explore" />
        </Press>
      )}

      <Label>Developer</Label>
      <Press onPress={() => router.push('/developer')}>
        <Row icon="server-outline" title="MCP server" sub={store.dev.mcp ? 'On. Your data is served from this phone' : 'Serve your data from this phone to AI tools'}>
          <Icon name="chevron-right" size={20} color={c.mut} />
        </Row>
      </Press>

      {store.signedIn ? (
        <>
          <Label>Account</Label>
          <Press onPress={() => store.downloadAccount().then((data) => shareJson('kakei-account.json', data)).catch(() => store.flash('Could not download your data'))}>
            <Row icon="download-outline" title="Download my data" sub="Groups and shared expenses stored for this account" />
          </Press>
          <Press onPress={() => {
            ask({
              title: 'Delete this account?',
              body: 'Enter the password. You will confirm once more.',
              confirm: 'Continue',
              destructive: true,
              input: { placeholder: 'Password', secure: true },
              onConfirm: (password) => {
                if (!password) return;
                ask({
                  title: 'Delete this account?',
                  body: 'Shared groups move to someone else in them. A group with no other account is removed. Expenses on this phone stay here.',
                  confirm: 'Delete account',
                  destructive: true,
                  onConfirm: async () => {
                    const err = await store.deleteAccount(password);
                    if (err) store.flash(err);
                  },
                });
              },
            });
          }} style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.neg }}>Delete account</Text>
          </Press>
        </>
      ) : null}

      <Press onPress={signOut} style={{ marginTop: 28 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.neg }}>{store.signedIn ? 'Sign out' : 'Erase everything on this phone'}</Text>
      </Press>
    </ScrollView>
  );
}

function TagBudgets() {
  const c = usePalette();
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const budgeted = store.tags.filter((tag) => (store.tagBudgets[tag] ?? 0) > 0);
  const free = store.tags.filter((tag) => !(store.tagBudgets[tag] ?? 0));
  const save = () => {
    const tag = store.addTag(picked || name);
    const n = Number(amount);
    if (!tag || !(n > 0)) return;
    store.setTagBudget(tag, n);
    setAdding(false);
    setPicked(null);
    setName('');
    setAmount('');
  };
  return (
    <View style={{ marginTop: 18, marginLeft: 4, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: c.line, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="tag-outline" size={16} color={c.mut} />
        <Text style={{ fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>TAG BUDGETS</Text>
      </View>
      {budgeted.length ? null : <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, lineHeight: 18 }}>Only the tags you pick get a limit. The rest are just labels.</Text>}
      {budgeted.map((tag) => (
        <TagBudget key={tag} tag={tag} value={store.tagBudgets[tag] ?? 0} onSave={(n) => store.setTagBudget(tag, n)} />
      ))}
      {!adding ? (
        <Press onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginLeft: 8 }}>
          <Icon name="plus" size={18} />
          <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }}>Add a tag budget</Text>
        </Press>
      ) : null}
      {adding ? (
        <View style={{ gap: 10, marginLeft: 8 }}>
          <Input value={name} onChangeText={(v) => { setName(v); setPicked(null); }} label="New tag" placeholder="New tag" caps="none" autoFocus style={{ fontFamily: font.medium, fontSize: 16, color: c.fg, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 6 }} />
          {free.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {free.map((tag) => {
              const on = picked === tag;
              return (
                <Press key={tag} onPress={() => { setPicked(tag); setName(''); }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: on ? c.acc : c.line, backgroundColor: on ? c.acc : 'transparent', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.medium, fontSize: 13, color: on ? c.accFg : c.fg }}>#{tag}</Text>
                </Press>
              );
            })}
          </View>
          ) : null}
          {picked || name.trim() ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: font.body, color: c.mut }}>₹</Text>
              <Input value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))} mode="number" label="Tag budget" placeholder="2000" style={{ flex: 1, fontFamily: font.displaySm, fontSize: 20, color: c.fg }} />
              <Press onPress={save} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: c.acc, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semi, color: c.accFg }}>Set</Text>
              </Press>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function TagBudget({ tag, value, onSave }: { tag: string; value: number; onSave: (n: number) => void }) {
  const c = usePalette();
  const [text, setText] = useState(String(value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 }}>
      <Icon name="tag-outline" size={16} color={c.mut} />
      <Text style={{ flex: 1, fontFamily: font.medium, color: c.fg }}>#{tag}</Text>
      <Text style={{ fontFamily: font.body, color: c.mut }}>₹</Text>
      <Input value={text} onChangeText={(v) => setText(v.replace(/[^0-9]/g, ''))} onBlur={() => onSave(Number(text) || 0)} mode="number" label={`${tag} budget`} style={{ width: 80, textAlign: 'right', fontFamily: font.displaySm, fontSize: 16, color: c.fg }} />
      <Press onPress={() => onSave(0)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={16} color={c.mut} />
      </Press>
    </View>
  );
}

function Row({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children?: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.faint }}>
      <Icon name={icon} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.fg }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Label({ children }: { children: string }) {
  const c = usePalette();
  return <Text style={{ marginTop: 32, marginBottom: 12, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>{children.toUpperCase()}</Text>;
}
