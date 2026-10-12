import { PermissionsAndroid, Platform } from 'react-native';

import type { Expense } from './types';

export type NotifyItem = { id: string; sender: string; body: string; ts: number; action?: 'tag' | 'ignore'; tag?: string };
export type Drained = { fresh: NotifyItem[]; decided: NotifyItem[] };

const NONE: Drained = { fresh: [], decided: [] };
const native = () => import('../../modules/kakie-sms');

/** Asks for everything the notification needs, then switches it on. Turning it off needs no permission. */
export async function setNotify(on: boolean): Promise<'ok' | 'denied' | 'ios' | 'build'> {
  if (Platform.OS !== 'android') return 'ios';
  try {
    const mod = await native();
    if (on) {
      const P = PermissionsAndroid.PERMISSIONS;
      const asked = [P.RECEIVE_SMS, P.READ_SMS, ...(Number(Platform.Version) >= 33 ? [P.POST_NOTIFICATIONS] : [])];
      const res = await PermissionsAndroid.requestMultiple(asked);
      const ok = (p: (typeof asked)[number]) => res[p] === PermissionsAndroid.RESULTS.GRANTED;
      // Without these two there is nothing to show, or nothing to hear. A missing READ_SMS only costs the inbox scan.
      if (!ok(P.RECEIVE_SMS) || (asked.includes(P.POST_NOTIFICATIONS) && !ok(P.POST_NOTIFICATIONS))) return 'denied';
    }
    await mod.notifySetEnabled(on);
    return 'ok';
  } catch {
    return 'build';
  }
}

export async function notifyIsOn(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await (await native()).notifyEnabled();
  } catch {
    return false;
  }
}

export async function testNotify(): Promise<boolean> {
  try {
    await (await native()).notifyTest();
    return true;
  } catch {
    return false;
  }
}

/** What happened while the app was closed. Empty on iOS and on an older build. */
export async function drainNotify(): Promise<Drained> {
  if (Platform.OS !== 'android') return NONE;
  try {
    return await (await native()).notifyDrain();
  } catch {
    return NONE;
  }
}

/** Teaches the notification what you usually call things: your four most used tags and the tag each merchant got last. */
export async function pushHints(expenses: Expense[]) {
  if (Platform.OS !== 'android') return;
  const byTag: Record<string, number> = {};
  const byMerchant: Record<string, Record<string, number>> = {};
  for (const e of expenses) {
    if (!e.tag || e.sample || e.groupId) continue;
    byTag[e.tag] = (byTag[e.tag] ?? 0) + 1;
    const key = e.merchant.toLowerCase();
    (byMerchant[key] ??= {})[e.tag] = (byMerchant[key][e.tag] ?? 0) + 1;
  }
  const tags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  const hints: Record<string, string> = {};
  for (const [m, counts] of Object.entries(byMerchant)) hints[m] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  try {
    await (await native()).notifySetHints(tags, hints);
  } catch {
    // An older build has no notifications. Nothing to teach.
  }
}
