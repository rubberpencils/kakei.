import { Linking, PermissionsAndroid, Platform } from 'react-native';

import { readUpiResponse, type PayStatus } from './upi';

export async function payWithUpi(uri: string): Promise<PayStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  if (Platform.OS === 'ios') {
    // iOS never reports the result back, so the caller asks the user.
    return Linking.openURL(uri).then(() => 'unknown' as const, () => 'no-app' as const);
  }
  try {
    const mod = await import('../../modules/kakie-sms');
    return readUpiResponse(await mod.payUpi(uri));
  } catch {
    return 'unsupported';
  }
}

export type InboxRow = { sender: string; body: string; date: number };

export async function readDeviceSms(limit = 80, quiet = false): Promise<{ rows: InboxRow[]; error: null | 'ios' | 'denied' | 'build' }> {
  if (Platform.OS !== 'android') return { rows: [], error: 'ios' };
  if (quiet && !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))) return { rows: [], error: 'denied' };
  const res = quiet ? PermissionsAndroid.RESULTS.GRANTED : await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Allow kakie. to read SMS messages?',
    message: 'Only bank transaction messages are accessed. Personal chats are never read.',
    buttonPositive: 'Allow',
    buttonNegative: "Don't allow",
  });
  if (res !== PermissionsAndroid.RESULTS.GRANTED) return { rows: [], error: 'denied' };
  try {
    const mod = await import('../../modules/kakie-sms');
    const rows = await mod.readInbox(limit);
    return { rows, error: null };
  } catch {
    return { rows: [], error: 'build' };
  }
}
