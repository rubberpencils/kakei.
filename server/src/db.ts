import { DatabaseSync } from 'node:sqlite';

export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    pragma journal_mode = wal;
    pragma foreign_keys = on;
    create table if not exists users (
      id text primary key,
      name text not null,
      phone text not null unique,
      pass text not null,
      created integer not null
    );
    create table if not exists sessions (
      token text primary key,
      user_id text not null references users(id) on delete cascade,
      created integer not null
    );
    create table if not exists people (
      id text primary key,
      name text not null,
      user_id text references users(id) on delete set null,
      created_by text
    );
    create table if not exists groups (
      id text primary key,
      name text not null,
      icon text not null,
      note text not null default '',
      kind text not null default 'group',
      code text not null unique,
      created_by text not null,
      sample integer not null default 0,
      updated integer not null
    );
    create table if not exists members (
      group_id text not null references groups(id) on delete cascade,
      person_id text not null,
      primary key (group_id, person_id)
    );
    create index if not exists members_person on members(person_id);
    create table if not exists expenses (
      id text primary key,
      owner_id text not null,
      group_id text references groups(id) on delete cascade,
      data text not null,
      updated integer not null
    );
    create index if not exists expenses_owner on expenses(owner_id);
    create index if not exists expenses_group on expenses(group_id);
    create table if not exists settlements (
      id text primary key,
      group_id text not null references groups(id) on delete cascade,
      data text not null,
      updated integer not null
    );
    create index if not exists settlements_group on settlements(group_id);
    create table if not exists hidden (
      user_id text not null,
      expense_id text not null references expenses(id) on delete cascade,
      primary key (user_id, expense_id)
    );
    create table if not exists prefs (
      user_id text primary key references users(id) on delete cascade,
      data text not null
    );
  `);
  const cols = db.prepare('pragma table_info(groups)').all() as { name: string }[];
  if (!cols.some((col) => col.name === 'simplify')) db.exec('alter table groups add column simplify integer not null default 1');
  if (!cols.some((col) => col.name === 'kind')) db.exec("alter table groups add column kind text not null default 'group'");
  // Paid until this time (ms). Null means free. Only read when the server does not make everyone pro.
  const userCols = db.prepare('pragma table_info(users)').all() as { name: string }[];
  if (!userCols.some((col) => col.name === 'pro_until')) db.exec('alter table users add column pro_until integer');
  // Kakei no longer stores UPI IDs. Drop the columns an older version created so nothing stays behind.
  for (const table of ['users', 'people']) {
    const has = (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).some((col) => col.name === 'vpa');
    if (has) db.exec(`alter table ${table} drop column vpa`);
  }
  return db;
}
