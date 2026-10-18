import { PermissionsAndroid, Platform } from 'react-native';

/** Android 13 and later need this before a bank-message notification can show. */
export async function askNotify() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}
