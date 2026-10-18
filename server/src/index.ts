import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';

import { createApp } from './app.ts';
import { googleVerifier } from './billing.ts';
import { openDb } from './db.ts';
import { loadKey } from './vault.ts';

function serviceAccount() {
  const raw = process.env.GOOGLE_SA_JSON?.trim();
  if (!raw) return '';
  if (raw.startsWith('{')) return raw;
  return existsSync(raw) ? readFileSync(raw, 'utf8') : '';
}

const serviceJson = serviceAccount();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './data/kakei.db';

mkdirSync(dirname(dbPath), { recursive: true });

const server = createApp(openDb(dbPath), {
  cors: process.env.CORS_ORIGIN ?? '*',
  key: loadKey(dbPath),
  // On unless set to false. Self-hosters get everything; the hosted server sets KAKEI_EVERYONE_PRO=false.
  everyonePro: process.env.KAKEI_EVERYONE_PRO !== 'false',
  otpUrl: process.env.SMS_OTP_URL,
  verifyPlay: serviceJson ? googleVerifier(serviceJson) : undefined,
});

server.listen(port, host, () => {
  console.log(`kakei. server listening on ${host}:${port}, db ${dbPath}`);
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of lan) console.log(`  phone URL: http://${n!.address}:${port}`);
});
