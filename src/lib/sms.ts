import { PermissionsAndroid, Platform } from 'react-native';

import { isPersonalSender } from './sender';

export type InboxRow = { sender: string; body: string; date: number };
export { isPersonalSender };

export async function readDeviceSms(limit = 80, quiet = false): Promise<{ rows: InboxRow[]; error: null | 'ios' | 'denied' | 'build' }> {
  if (Platform.OS !== 'android') return { rows: [], error: 'ios' };
  if (quiet && !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))) return { rows: [], error: 'denied' };
  const res = quiet ? PermissionsAndroid.RESULTS.GRANTED : await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Allow Kakei. to read SMS messages?',
    message: 'Kakei reads bank and payment messages from senders like VM-HDFCBK. Messages from phone numbers are skipped on the phone and are not opened.',
    buttonPositive: 'Allow',
    buttonNegative: "Don't allow",
  });
  if (res !== PermissionsAndroid.RESULTS.GRANTED) return { rows: [], error: 'denied' };
  try {
    const mod = await import('../../modules/kakie-sms');
    const rows = (await mod.readInbox(limit)).filter((row) => !isPersonalSender(row.sender));
    return { rows, error: null };
  } catch {
    return { rows: [], error: 'build' };
  }
}
