import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';

import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { loadKey } from './vault.ts';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './data/kakei.db';

mkdirSync(dirname(dbPath), { recursive: true });

const server = createApp(openDb(dbPath), {
  cors: process.env.CORS_ORIGIN ?? '*',
  key: loadKey(dbPath),
  // On unless set to false. Self-hosters get everything; the hosted server sets KAKEI_EVERYONE_PRO=false.
  everyonePro: process.env.KAKEI_EVERYONE_PRO !== 'false',
});

server.listen(port, host, () => {
  console.log(`kakei. server listening on ${host}:${port}, db ${dbPath}`);
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of lan) console.log(`  phone URL: http://${n!.address}:${port}`);
});
