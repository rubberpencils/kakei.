import { requireNativeModule } from 'expo-modules-core';

export type SmsRow = { sender: string; body: string; date: number };

const native = requireNativeModule<{
  readInbox: (limit: number) => Promise<SmsRow[]>;
  payUpi: (uri: string, pkg: string | null) => Promise<string>;
}>('KakieSms');

export function readInbox(limit: number) {
  return native.readInbox(limit);
}

export function payUpi(uri: string, pkg: string | null = null) {
  return native.payUpi(uri, pkg);
}