import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Avatar, Icon, Press, Word, usePalette } from '@/components/ui';
import { accountsFrom } from '@/lib/ledger';
import { readDeviceSms } from '@/lib/sms';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';
import { maskVpa } from '@/lib/upi';

export default function Profile() {
  const c = usePalette();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(store.you.name);
  const [budget, setBudget] = useState(store.budget ? String(store.budget) : '');
  const accounts = accountsFrom(store.expenses);
  const [editVpa, setEditVpa] = useState(false);
  const [vpaDraft, setVpaDraft] = useState('');
  const [vpaError, setVpaError] = useState<string | null>(null);

  const saveVpa = () => {
    const err = store.setVpa(vpaDraft);
    if (err) return setVpaError(err);
    setEditVpa(false);
  };

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
          <TextInput value={name} onChangeText={setName} onEndEditing={() => store.setName(name)} onBlur={() => store.setName(name)} style={{ fontFamily: font.semi, fontSize: 19, color: c.fg, padding: 0 }} />
          <Text style={{ fontFamily: font.mono, fontSize: 12.5, color: c.mut, marginTop: 4 }}>{store.phone}</Text>
        </View>
      </View>
      <Press onPress={() => router.push({ pathname: '/person/[id]', params: { id: store.you.id } })} style={{ marginTop: 12 }}>
        <Row icon="format-list-bulleted" title="Your activity" sub="Every expense and payment you are part of">
          <Icon name="chevron-right" size={20} color={c.mut} />
        </Row>
      </Press>

      <Label>Get paid</Label>
      {editVpa ? (
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <TextInput
            value={vpaDraft}
            onChangeText={(v) => { setVpaDraft(v); setVpaError(null); }}
            placeholder="name@bank"
            placeholderTextColor={c.mut}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            keyboardType="email-address"
            onSubmitEditing={saveVpa}
            style={{ height: 52, borderRadius: 16, borderWidth: 1, borderColor: vpaError ? c.neg : c.line, paddingHorizontal: 16, fontFamily: font.body, fontSize: 16, color: c.fg }}
          />
          {vpaError ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.neg }}>{vpaError}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Press onPress={saveVpa} style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: c.acc, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 13.5 }}>Save</Text>
            </Press>
            <Press onPress={() => { setEditVpa(false); setVpaError(null); }} style={{ height: 40, paddingHorizontal: 16, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.mut, fontSize: 13.5 }}>Cancel</Text>
            </Press>
          </View>
        </View>
      ) : (
        store.you.vpa ? (
          <Row icon="qrcode" title={maskVpa(store.you.vpa)} sub="Friends can pay you by UPI">
            <Press onPress={() => { setVpaDraft(store.you.vpa ?? ''); setEditVpa(true); }} style={{ height: 34, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 12.5 }}>Change</Text>
            </Press>
            <Press onPress={() => ask({ title: 'Remove your UPI ID?', body: 'Friends will only be able to mark payments to you by hand.', confirm: 'Remove', destructive: true, onConfirm: () => store.setVpa('') })} style={{ height: 34, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.mut, fontSize: 12.5 }}>Remove</Text>
            </Press>
          </Row>
        ) : (
          <Press onPress={() => { setVpaDraft(''); setEditVpa(true); }}>
            <Row icon="qrcode" title="Add your UPI ID" sub="Without it, friends settle with you by hand">
              <Icon name="chevron-right" size={20} color={c.mut} />
            </Row>
          </Press>
        )
      )}
      <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
        Stored encrypted on the server and shown only to people in your groups, when they settle up with you.
      </Text>

      <Label>SMS import</Label>
      <Row icon="message-text-outline" title="Read bank SMS" sub={store.smsOn ? 'Checks the inbox each time you open kakie.' : 'Off'}>
        <Switch value={store.smsOn} onValueChange={(on) => { store.setSmsOn(on); if (on) scan(); }} trackColor={{ true: c.acc, false: c.bar }} />
      </Row>
      <Press onPress={scan}>
        <Row icon="refresh" title="Scan inbox now" />
      </Press>
      {accounts.map((a) => (
        <Row key={`${a.bank}${a.account}`} icon={a.credit ? 'credit-card-outline' : 'bank-outline'} title={`${a.bank} ••${a.account}`} sub={a.credit ? 'Card' : 'Account'}>
          <Text style={{ fontFamily: font.mono, color: c.mut, fontSize: 13 }}>{a.count}</Text>
        </Row>
      ))}

      <Label>Budget</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <Text style={{ fontFamily: font.display, fontSize: 22, color: c.mut }}>₹</Text>
        <TextInput
          value={budget}
          onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="60000"
          placeholderTextColor={c.mut}
          onEndEditing={() => store.setBudget(Number(budget) || 0)}
          onBlur={() => store.setBudget(Number(budget) || 0)}
          style={{ flex: 1, fontFamily: font.displaySm, fontSize: 28, color: c.fg, padding: 0 }}
        />
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut }}>One number for the month. Spend under it is savings.</Text>

      <Label>Server</Label>
      <Row icon="server-network" title={store.base.replace(/^https?:\/\//, '')} sub={syncLine}>
        <Press onPress={store.syncNow} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 12.5 }}>Sync now</Text>
        </Press>
      </Row>
      <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
        Groups, expenses and settlements live on this server so everyone in a group sees the same balances. Changes made offline are sent when you reconnect.
      </Text>

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

      <Press onPress={signOut} style={{ marginTop: 28 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.neg }}>Sign out</Text>
      </Press>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        <Icon name="lock-outline" size={18} color={c.mut} />
        <Text style={{ flex: 1, fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: c.mut }}>
          Messages are parsed on this phone. Only the amount, merchant, date, rail and last four digits of the account reach the server. The message text never leaves the phone.
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
