import { requireNativeModule } from 'expo-modules-core';

export type SmsRow = { sender: string; body: string; date: number };
export type McpRequest = { id: string; body: string };
/** kind: tailscale = reachable from anywhere over Tailscale, lan = Wi-Fi or hotspot, cellular = carrier address (not reachable from outside). */
export type LocalAddress = { ip: string; kind: 'tailscale' | 'lan' | 'cellular'; iface: string };

type Events = { onMcpRequest: (e: McpRequest) => void; onSms: (e: { n: number }) => void };

const native = requireNativeModule<{
  readInbox: (limit: number) => Promise<SmsRow[]>;
  drainSms: () => Promise<(SmsRow & { id: string })[]>;
  setSmsNotify: (on: boolean) => Promise<void>;
  setMerchantTags: (json: string) => Promise<void>;
  drainFileActions: () => Promise<{ id: string; kind: string; tag: string }[]>;
  showTestSms: () => Promise<void>;
  showNote: (title: string, body: string, id: number) => Promise<void>;
  startMcp: (port: number, token: string, lan: boolean) => Promise<number>;
  stopMcp: () => Promise<void>;
  mcpReply: (id: string, status: number, body: string) => Promise<void>;
  localAddresses: () => Promise<LocalAddress[]>;
  batteryExempt: () => Promise<boolean>;
  requestBatteryExemption: () => Promise<void>;
  addListener: <K extends keyof Events>(name: K, cb: Events[K]) => { remove: () => void };
}>('KakieSms');

export function readInbox(limit: number) {
  return native.readInbox(limit);
}

export function drainSms() {
  return native.drainSms();
}

export function setSmsNotify(on: boolean) {
  return native.setSmsNotify(on);
}

export function setMerchantTags(json: string) {
  return native.setMerchantTags(json);
}

export function drainFileActions() {
  return native.drainFileActions();
}

export function showTestSms() {
  return native.showTestSms();
}

export function showNote(title: string, body: string, id: number) {
  return native.showNote(title, body, id);
}

export function onSms(cb: () => void) {
  return native.addListener('onSms', () => cb());
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
