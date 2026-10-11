import * as Clipboard from 'expo-clipboard';
import { getRandomBytes } from 'expo-crypto';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ask, Back, buzz, Icon, Press, Segmented, Toggle, usePalette, Word } from '@/components/ui';
import { useMcpStatus } from '@/lib/mcp-status';
import { useStore } from '@/lib/store';
import { font } from '@/lib/theme';

const newToken = () => Array.from(getRandomBytes(24), (b) => b.toString(16).padStart(2, '0')).join('');

export default function Developer() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const status = useMcpStatus();
  const { mcp, lan, port, token } = store.dev;
  const android = Platform.OS === 'android';

  const host = lan ? status.addresses[0] ?? '<phone-ip>' : '127.0.0.1';
  const url = `http://${host}:${port}/mcp`;
  const config = JSON.stringify({ mcpServers: { kakei: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

  const toggle = () => {
    buzz();
    if (!mcp) store.setDev({ mcp: true, token: token || newToken() });
    else store.setDev({ mcp: false });
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
          <Text style={label(c.mut)}>How it connects</Text>
          <Segmented
            options={[{ id: 'usb', label: 'USB only' }, { id: 'wifi', label: 'Wi-Fi' }]}
            value={lan ? 'wifi' : 'usb'}
            onChange={(v) => store.setDev({ lan: v === 'wifi' })}
          />
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 10, lineHeight: 18 }}>
            {lan
              ? 'Anyone on the same Wi-Fi can reach the port, but nothing is answered without the token. Use a network you trust.'
              : `Nothing leaves the phone over the network. With the phone plugged in, run adb reverse tcp:${port} tcp:${port} on the computer.`}
          </Text>

          <Text style={label(c.mut)}>Address</Text>
          <Text selectable style={{ fontFamily: font.mono, fontSize: 13, color: c.fg }}>{url}</Text>

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
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: c.mut, marginTop: 14, lineHeight: 18 }}>
            Kakei keeps the screen awake while this is on, and the server stops when you close the app. It answers only while the app is open.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const label = (color: string) => ({ marginTop: 30, marginBottom: 8, fontFamily: font.medium, fontSize: 12, letterSpacing: 1, color, textTransform: 'uppercase' as const });
