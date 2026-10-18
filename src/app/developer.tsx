import * as Clipboard from 'expo-clipboard';
import { getRandomBytes } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Back, buzz, Icon, Press, Segmented, Toggle, usePalette, Word } from '@/components/ui';
import { useMcpStatus } from '@/lib/mcp-status';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const newToken = () => Array.from(getRandomBytes(24), (b) => b.toString(16).padStart(2, '0')).join('');

const kindLabel = { tailscale: 'Tailscale, works anywhere', lan: 'Wi-Fi, same network only', cellular: 'mobile data, not reachable' } as const;

async function needsNotifications() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return false;
  return !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS));
}

export default function Developer() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const status = useMcpStatus();
  const { mcp, lan, port, token } = store.dev;
  const android = Platform.OS === 'android';
  const [battery, setBattery] = useState<boolean | null>(null);
  const [notify, setNotify] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!android) return;
    setNotify(!(await needsNotifications()));
    try {
      const mod = await import('../../modules/kakie-sms');
      setBattery(await mod.batteryExempt());
    } catch {
      setBattery(null);
    }
  }, [android]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [refresh]);

  const askNotifications = async () => {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    refresh();
  };
  const askBattery = async () => {
    try {
      const mod = await import('../../modules/kakie-sms');
      await mod.requestBatteryExemption();
    } catch {
      store.flash('Open Android settings > Apps > Kakei > Battery and choose Unrestricted');
    }
  };

  const tailscale = status.addresses.find((a) => a.kind === 'tailscale');
  // Never fall back to a mobile-data address: it looks usable but nothing outside can reach it.
  const host = lan ? (tailscale ?? status.addresses.find((a) => a.kind === 'lan'))?.ip ?? '<phone-ip>' : '127.0.0.1';
  const url = `http://${host}:${port}/mcp`;
  const config = JSON.stringify({ mcpServers: { kakei: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

  const toggle = async () => {
    buzz();
    if (mcp) return store.setDev({ mcp: false });
    store.setDev({ mcp: true, token: token || newToken() });
    // A foreground service needs a visible notification, and Android needs to let the app run while the screen is off.
    if (await needsNotifications()) await askNotifications();
    try {
      const mod = await import('../../modules/kakie-sms');
      if (!(await mod.batteryExempt())) await mod.requestBatteryExemption();
    } catch {
      // The toggle still works. The row below shows what is missing.
    }
  };
  const rotate = () =>
    ask({
      title: 'Make a new token?',
      body: 'Anything using the old token stops working until you paste the new config.',
      confirm: 'New token',
      destructive: true,
      onConfirm: () => store.setDev({ token: newToken() }),
    });
  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    store.flash(`${what} copied`);
  };

  const state = !mcp
    ? 'Off'
    : status.error
      ? status.error
      : status.listening
        ? `Listening on port ${status.port}. ${status.served} ${status.served === 1 ? 'request' : 'requests'} answered`
        : 'Starting';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }}>
      <Back />
      <Word size={28}>Developer</Word>

      <Text style={label(c.mut)}>MCP server</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.sub, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="server-outline" size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>Serve my data over MCP</Text>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: status.error && mcp ? c.neg : c.mut, marginTop: 2, lineHeight: 17 }}>{android ? state : 'Android only'}</Text>
        </View>
        {android ? <Toggle on={mcp} onPress={toggle} /> : null}
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, marginTop: 14, lineHeight: 19 }}>
        Your phone becomes the server. An AI app on your computer can ask about your spending, and the answer is worked out on the phone. There is no cloud copy and no relay in between. It is read-only.
      </Text>

      {mcp && android ? (
        <>
          <Text style={label(c.mut)}>Keep it running</Text>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginBottom: 6, lineHeight: 18 }}>
            It keeps answering when you leave the app, as long as you do not swipe Kakei away. A notification shows while it runs.
          </Text>
          <Check ok={notify} title="Show a notification" sub="Android needs one for anything running in the background" action="Allow" onPress={askNotifications} />
          <Check ok={battery} title="Run with the screen off" sub="Stops Android from putting Kakei to sleep" action="Allow" onPress={askBattery} />

          <Text style={label(c.mut)}>How it connects</Text>
          <Segmented
            options={[{ id: 'usb', label: 'USB only' }, { id: 'net', label: 'Anywhere' }]}
            value={lan ? 'net' : 'usb'}
            onChange={(v) => store.setDev({ lan: v === 'net' })}
          />
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
            {lan
              ? 'Listens on every network the phone is on. Nothing is answered without the token. Wi-Fi traffic is not encrypted, so away from home use Tailscale: install it on the phone and the computer, then use the Tailscale address below. It works on mobile data too.'
              : `Nothing leaves the phone over the network. With the phone plugged in, run adb reverse tcp:${port} tcp:${port} on the computer.`}
          </Text>
          {lan ? (
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 8, lineHeight: 18 }}>
              Kakei does not open the phone to the public internet. Mobile networks block inbound connections, and anything reaching it that way would be unencrypted.
            </Text>
          ) : null}

          <Text style={label(c.mut)}>Address</Text>
          <Text selectable style={{ fontFamily: font.mono, fontSize: 13, color: c.fg }}>{url}</Text>
          {lan && status.addresses.length > 0 ? (
            <View style={{ marginTop: 8, gap: 2 }}>
              {status.addresses.map((a) => (
                <Text key={a.ip} selectable style={{ fontFamily: font.mono, fontSize: 12, color: c.mut }}>
                  {a.ip}  {kindLabel[a.kind]}
                </Text>
              ))}
            </View>
          ) : null}
          {lan && !tailscale && status.listening ? (
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 8, lineHeight: 18 }}>{host === '<phone-ip>'
                ? 'No usable address. Connect the phone to Wi-Fi, or open Tailscale and connect it.'
                : 'Tailscale is not connected on this phone. Connect it to reach this away from home. On the same Wi-Fi the address above works.'}</Text>
          ) : null}

          <Text style={label(c.mut)}>Token</Text>
          <Text selectable style={{ fontFamily: font.mono, fontSize: 12.5, color: c.fg, lineHeight: 18 }}>{token}</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Press onPress={() => copy(config, 'Config')} style={{ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: c.acc, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="content-copy" size={16} color={c.accFg} />
              <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 14 }}>Copy MCP config</Text>
            </Press>
            <Press onPress={rotate} style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.medium, color: c.fg, fontSize: 14 }}>New token</Text>
            </Press>
          </View>
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
            Paste the config into the MCP settings of Cursor, Claude Desktop or any client that supports HTTP servers.
          </Text>

          <Text style={label(c.mut)}>What it can see</Text>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: c.mut, lineHeight: 20 }}>
            Shared: amounts, merchants, tags, dates, your share of each bill, groups and balances.{'\n'}
            Never shared: bank SMS text, account numbers, your phone number, your password.
          </Text>
        </>
      ) : null}

      {store.pro ? (
        <>
          <Text style={label(c.mut)}>Remote MCP</Text>
          {store.dev.remoteId ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>Remote MCP</Text>
                  <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 2 }}>
                    {store.dev.remote ? 'On. A readable copy is on the server.' : 'Off. The token is kept.'}
                  </Text>
                </View>
                <Toggle on={store.dev.remote} onPress={() => store.setRemote(!store.dev.remote).then((err) => { if (err) store.flash(err); })} />
              </View>
              <Text selectable style={{ fontFamily: font.mono, fontSize: 12.5, color: c.fg, marginTop: 12 }}>{`${store.base}/m/${store.dev.remoteId}`}</Text>
              {store.dev.remoteToken ? (
                <>
                  <Text selectable style={{ fontFamily: font.mono, fontSize: 12.5, color: c.fg, marginTop: 8 }}>{store.dev.remoteToken}</Text>
                  <Press onPress={() => copy(JSON.stringify({ mcpServers: { kakei: { url: `${store.base}/m/${store.dev.remoteId}`, headers: { Authorization: `Bearer ${store.dev.remoteToken}` } } } }, null, 2), 'Config')} style={{ marginTop: 14, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: c.acc, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                    <Icon name="content-copy" size={16} color={c.accFg} />
                    <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 14 }}>Copy MCP config</Text>
                  </Press>
                </>
              ) : (
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 8 }}>The token was shown on the phone that created it. Regenerate to copy a config with the bearer token.</Text>
              )}
              <Press onPress={() => ask({
                title: 'Replace the remote token?',
                body: 'The old token stops working. The readable copy stays.',
                confirm: 'Replace',
                destructive: true,
                onConfirm: () => store.regenerateRemote().then((err) => { if (err) store.flash(err); }),
              })} style={{ marginTop: 14 }}>
                <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.fg }}>Regenerate</Text>
              </Press>
            </>
          ) : (
            <Press onPress={() => ask({
              title: 'Create a remote MCP?',
              body: 'A readable copy is uploaded. SMS text and account numbers are not. Switching off stops access without deleting the token.',
              confirm: 'Create remote MCP',
              onConfirm: () => store.createRemote().then((err) => { if (err) store.flash(err); }),
            })}>
              <Text style={{ fontFamily: font.semi, fontSize: 15, color: c.fg }}>Create remote MCP</Text>
            </Press>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Check({ ok, title, sub, action, onPress }: { ok: boolean | null; title: string; sub: string; action: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Icon name={ok ? 'check-circle' : 'circle-outline'} size={22} color={ok ? c.pos : c.mut} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: c.fg }}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12, color: c.mut, marginTop: 2 }}>{sub}</Text>
      </View>
      {ok ? null : (
        <Press onPress={onPress} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.acc, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.semi, color: c.accFg, fontSize: 12.5 }}>{action}</Text>
        </Press>
      )}
    </View>
  );
}

const label = (color: string) => ({ marginTop: 30, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color, textTransform: 'uppercase' as const });
