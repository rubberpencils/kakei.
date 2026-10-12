import { requireNativeModule } from 'expo-modules-core';

export type SmsRow = { sender: string; body: string; date: number };
export type McpRequest = { id: string; body: string };
/** kind: tailscale = reachable from anywhere over Tailscale, lan = Wi-Fi or hotspot, cellular = carrier address (not reachable from outside). */
export type LocalAddress = { ip: string; kind: 'tailscale' | 'lan' | 'cellular'; iface: string };

type Events = { onMcpRequest: (e: McpRequest) => void };

const native = requireNativeModule<{
  readInbox: (limit: number) => Promise<SmsRow[]>;
  startMcp: (port: number, token: string, lan: boolean) => Promise<number>;
  stopMcp: () => Promise<void>;
  mcpReply: (id: string, status: number, body: string) => Promise<void>;
  localAddresses: () => Promise<LocalAddress[]>;
  notifyEnabled: () => Promise<boolean>;
  notifySetEnabled: (on: boolean) => Promise<void>;
  notifySetHints: (tags: string[], hints: Record<string, string>) => Promise<void>;
  notifyDrain: () => Promise<string>;
  notifyTest: () => Promise<void>;
  batteryExempt: () => Promise<boolean>;
  requestBatteryExemption: () => Promise<void>;
  addListener: <K extends keyof Events>(name: K, cb: Events[K]) => { remove: () => void };
}>('KakieSms');

export function readInbox(limit: number) {
  return native.readInbox(limit);
}

/** Opens a bearer-token HTTP listener. lan=false is loopback only. Resolves with the bound port. */
export function startMcp(port: number, token: string, lan: boolean) {
  return native.startMcp(port, token, lan);
}

export function stopMcp() {
  return native.stopMcp();
}

export function mcpReply(id: string, status: number, body: string) {
  return native.mcpReply(id, status, body);
}

/**
 * Addresses of this phone. An app built before the interface labels existed returns bare strings.
 * Those are still accepted, so a JS update never blanks the address. Without an interface name a
 * 100.64.0.0/10 address could be a carrier's, so it is not trusted as Tailscale.
 */
export async function localAddresses(): Promise<LocalAddress[]> {
  const raw: unknown = await native.localAddresses();
  if (!Array.isArray(raw)) return [];
  const out: LocalAddress[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const [a, b] = item.split('.').map(Number);
      out.push({ ip: item, kind: a === 100 && b >= 64 && b <= 127 ? 'cellular' : 'lan', iface: '' });
    } else if (item && typeof item.ip === 'string') {
      out.push({ ip: item.ip, kind: item.kind === 'tailscale' || item.kind === 'cellular' ? item.kind : 'lan', iface: String(item.iface ?? '') });
    }
  }
  return out;
}

/** A bank message that got a notification. action is set once the user answered from the notification. */
export type NotifyItem = { id: string; sender: string; body: string; ts: number; action?: 'tag' | 'ignore'; tag?: string };

export function notifyEnabled() {
  return native.notifyEnabled();
}

export function notifySetEnabled(on: boolean) {
  return native.notifySetEnabled(on);
}

/** Shows a pretend bank message as a notification so the buttons can be tried. It is never filed. */
export function notifyTest() {
  return native.notifyTest();
}

/** The user's most used tags, and the tag they gave each merchant before, so the notification can suggest the right one. */
export function notifySetHints(tags: string[], hints: Record<string, string>) {
  return native.notifySetHints(tags, hints);
}

/** New messages since the last call, and answers given from notifications. Each is handed over once. */
export async function notifyDrain(): Promise<{ fresh: NotifyItem[]; decided: NotifyItem[] }> {
  const parsed = JSON.parse(await native.notifyDrain());
  const clean = (list: unknown): NotifyItem[] => (Array.isArray(list) ? list.map((x) => ({
    id: String(x.id), sender: String(x.sender), body: String(x.body), ts: Number(x.ts),
    action: x.action === 'tag' || x.action === 'ignore' ? x.action : undefined,
    tag: typeof x.tag === 'string' ? x.tag : undefined,
  })) : []);
  return { fresh: clean(parsed.fresh), decided: clean(parsed.decided) };
}

/** True when Android will not put the app to sleep to save battery. */
export function batteryExempt() {
  return native.batteryExempt();
}

export function requestBatteryExemption() {
  return native.requestBatteryExemption();
}

export function onMcpRequest(cb: (e: McpRequest) => void) {
  return native.addListener('onMcpRequest', cb);
}
