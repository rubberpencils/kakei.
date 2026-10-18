import { PermissionsAndroid, Platform } from 'react-native';

/** Android 13 and later need this before a bank-message notification can show. */
export async function askNotify() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

export async function showNote(title: string, body: string, id: number) {
  if (Platform.OS !== 'android') return;
  try {
    const mod = await import('../../modules/kakie-sms');
    await mod.showNote(title, body, id);
  } catch {
    // The installed app owns notifications. Expo Go has nothing to show.
  }
}
