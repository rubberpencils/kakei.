import { scryptAsync } from '@noble/hashes/scrypt.js';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';

import type { Expense, Group, MonthSnapshot, Person, Settlement } from './types';
import type { MerchantRule } from './parser';

const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 };

export type BackupPayload = {
  expenses: Expense[];
  settlements: Settlement[];
  groups: Group[];
  people: Person[];
  budget: number;
  tags: string[];
  rules: MerchantRule[];
  history: MonthSnapshot[];
};

function b64(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string) {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function seal(plain: Uint8Array, keyBytes: Uint8Array) {
  const key = await AESEncryptionKey.import(keyBytes);
  const sealed = await aesEncryptAsync(plain, key);
  return sealed.combined('base64');
}

async function openSeal(combined: string, keyBytes: Uint8Array) {
  const key = await AESEncryptionKey.import(keyBytes);
  const sealed = AESSealedData.fromCombined(combined);
  return aesDecryptAsync(sealed, key, { output: 'bytes' });
}

export async function sealBackup(payload: BackupPayload, password: string) {
  const dataKey = getRandomBytes(32);
  const blob = await seal(new TextEncoder().encode(JSON.stringify(payload)), dataKey);
  const salt = getRandomBytes(16);
  const wrapKey = await scryptAsync(new TextEncoder().encode(password), salt, SCRYPT);
  const wrap = `${b64(salt)}.${await seal(dataKey, wrapKey)}`;
  return { wrap, blob };
}

export async function openBackup(wrap: string, blob: string, password: string): Promise<BackupPayload> {
  const dot = wrap.indexOf('.');
  if (dot < 0) throw new Error('That backup cannot be opened');
  const wrapKey = await scryptAsync(new TextEncoder().encode(password), unb64(wrap.slice(0, dot)), SCRYPT);
  const dataKey = await openSeal(wrap.slice(dot + 1), wrapKey);
  const plain = await openSeal(blob, dataKey);
  return JSON.parse(new TextDecoder().decode(plain)) as BackupPayload;
}
