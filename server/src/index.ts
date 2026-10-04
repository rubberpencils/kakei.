import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';

import { createApp } from './app.ts';
import { openDb } from './db.ts';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './data/kakie.db';

mkdirSync(dirname(dbPath), { recursive: true });

function dataKey() {
  const raw = process.env.DATA_KEY;
  if (raw) {
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) throw new Error('DATA_KEY must be 64 hex characters');
    return key;
  }
  const file = join(dirname(dbPath), 'data.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
}

const server = createApp(openDb(dbPath), { cors: process.env.CORS_ORIGIN ?? '*', key: dataKey() });

server.listen(port, host, () => {
  console.log(`kakie. server listening on ${host}:${port}, db ${dbPath}`);
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of lan) console.log(`  phone URL: http://${n!.address}:${port}`);
});
