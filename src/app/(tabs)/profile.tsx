import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/input';
import { ask, Avatar, Icon, Press, Word, usePalette } from '@/components/ui';
import { serverName } from '@/lib/api';
import { accountsFrom } from '@/lib/ledger';
import { readDeviceSms } from '@/lib/sms';
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
    store.flash(n ? `${n} new bank messages` : 'No new bank messages');
    if (n) router.push('/review');
  };

  const signOut = () => {
    if (!store.signedIn) {
      ask({ title: 'Erase everything on this phone?', body: 'Your expenses, splits and groups are deleted. Nothing is stored anywhere else, so this cannot be undone.', confirm: 'Erase', destructive: true, onConfirm: store.signOut });
      return;
    }
    const msg = store.pending ? `${store.pending} changes have not reached the server and will be lost.` : 'You can log back in with your phone number.';
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
          <Input value={name} onChangeText={setName} onBlur={() => store.setName(name)} label="Your name" caps="words" style={{ fontFamily: font.semi, fontSize: 19, color: c.fg, padding: 0 }} />
          <Text style={{ fontFamily: font.mono, fontSize: 12.5, color: c.mut, marginTop: 4 }}>{store.signedIn ? store.phone : 'On this phone only'}</Text>
        </View>
      </View>
      <Press onPress={() => router.push({ pathname: '/person/[id]', params: { id: store.you.id } })} style={{ marginTop: 12 }}>
        <Row icon="format-list-bulleted" title="Your activity" sub="Every expense and payment you are part of">
          <Icon name="chevron-right" size={20} color={c.mut} />
        </Row>
      </Press>

      <Label>SMS import</Label>
      <Row icon="message-text-outline" title="Read bank SMS" sub={store.smsOn ? 'Checks the inbox each time you open Kakei.' : 'Off'}>
        <Switch value={store.smsOn} onValueChange={(on) => { store.setSmsOn(on); if (on) scan(); }} trackColor={{ true: c.acc, false: c.bar }} />
      </Row>
      <Press onPress={scan}>
        <Row icon="refresh" title="Scan inbox now" />
      </Press>
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

      <Label>Sync and sharing</Label>
      {store.signedIn ? (
        <>
          <Row icon="server-network" title={serverName(store.base)} sub={syncLine}>
            <Press onPress={store.syncNow} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 12.5 }}>Sync now</Text>
            </Press>
          </Row>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
            Groups, expenses and settlements live on this server so everyone in a group sees the same balances. Changes made offline are sent when you reconnect.
          </Text>
        </>
      ) : (
        <>
          <Press onPress={store.connect}>
            <Row icon="account-sync-outline" title="Sync with friends" sub="Off. Everything stays on this phone">
              <Icon name="chevron-right" size={20} color={c.mut} />
            </Row>
          </Press>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
            Not needed for your own spending, SMS import or quick splits. Turn it on only to share a group so everyone sees the same balances. What you have now moves with you.
          </Text>
        </>
      )}

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

      <Press onPress={signOut} style={{ marginTop: 28 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.neg }}>{store.signedIn ? 'Sign out' : 'Erase everything on this phone'}</Text>
      </Press>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        <Icon name="lock-outline" size={18} color={c.mut} />
        <Text style={{ flex: 1, fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: c.mut }}>
          Messages are parsed on this phone. The message text never leaves it.{store.signedIn ? ' Only the amount, merchant, date, rail and last four digits of the account reach the server.' : ' With sync off, nothing reaches any server.'}
        </Text>
      </View>
    </ScrollView>
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
  return <Text style={{ marginTop: 32, marginBottom: 6, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color: c.mut }}>{children.toUpperCase()}</Text>;
}
