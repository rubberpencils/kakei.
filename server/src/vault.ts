import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Shared expenses and settlements are sealed with AES-256-GCM before they reach the database file, so a copy of the
// file (a backup, a stolen disk) is unreadable without the key. The key is kept apart from the database.
const PREFIX = 'enc1:';

export type Vault = {
  seal: (text: string) => string;
  open: (text: string) => string;
  isSealed: (text: string) => boolean;
};

export function makeVault(key: Buffer): Vault {
  if (key.length !== 32) throw new Error('The data key must be 32 bytes');
  return {
    seal(text) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open(text) {
      // Rows saved before sealing existed are plain JSON. They are sealed the next time the server starts.
      if (!text.startsWith(PREFIX)) return text;
      const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
    isSealed: (text) => text.startsWith(PREFIX),
  };
}

/**
 * The key comes from KAKEI_DATA_KEY (32 bytes as base64 or hex) when it is set. Set it in the host's environment so
 * the key never sits on the same disk as the data. Without it, one is made once and saved next to the database.
 */
export function loadKey(dbPath: string, env: string | undefined = process.env.KAKEI_DATA_KEY): Buffer {
  if (env?.trim()) {
    const t = env.trim();
    const key = /^[0-9a-f]{64}$/i.test(t) ? Buffer.from(t, 'hex') : Buffer.from(t, 'base64');
    if (key.length !== 32) throw new Error('KAKEI_DATA_KEY must be 32 bytes, as base64 or 64 hex characters');
    return key;
  }
  const file = join(dirname(dbPath), 'data.key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  mkdirSync(dirname(file), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows has no file modes.
  }
  console.warn('kakei. made a data key in data.key. Set KAKEI_DATA_KEY in the environment to keep it off this disk.');
  return key;
}
