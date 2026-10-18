import { PermissionsAndroid, Platform } from 'react-native';

import { isPersonalSender } from './sender';

export type InboxRow = { sender: string; body: string; date: number; id?: string };
export { isPersonalSender };

export async function syncSmsBridge(on: boolean, tags: Record<string, string>) {
  if (Platform.OS !== 'android') return;
  try {
    const mod = await import('../../modules/kakie-sms');
    await mod.setSmsNotify(on);
    await mod.setMerchantTags(JSON.stringify(tags));
  } catch {
    /* The installed build is older than this screen. */
  }
}

export async function drainFileActions(): Promise<{ id: string; kind: string; tag: string }[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const mod = await import('../../modules/kakie-sms');
    return await mod.drainFileActions();
  } catch {
    return [];
  }
}

export async function showTestSms() {
  const mod = await import('../../modules/kakie-sms');
  await mod.showTestSms();
}

export async function drainDeviceSms(): Promise<InboxRow[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const mod = await import('../../modules/kakie-sms');
    return (await mod.drainSms()).filter((row) => !isPersonalSender(row.sender));
  } catch {
    return [];
  }
}

export function onBankSms(cb: () => void) {
  let removed = false;
  let sub: { remove: () => void } | null = null;
  import('../../modules/kakie-sms')
    .then((mod) => {
      if (removed) return;
      sub = mod.onSms(cb);
    })
    .catch(() => {});
  return () => {
    removed = true;
    sub?.remove();
  };
}

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
