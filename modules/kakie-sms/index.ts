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

export function localAddresses() {
  return native.localAddresses();
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
