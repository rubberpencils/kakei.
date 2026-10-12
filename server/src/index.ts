import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';

import { createApp } from './app.ts';
import { openDb } from './db.ts';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './data/kakei.db';

mkdirSync(dirname(dbPath), { recursive: true });

const server = createApp(openDb(dbPath), { cors: process.env.CORS_ORIGIN ?? '*' });

server.listen(port, host, () => {
  console.log(`kakei. server listening on ${host}:${port}, db ${dbPath}`);
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of lan) console.log(`  phone URL: http://${n!.address}:${port}`);
});
