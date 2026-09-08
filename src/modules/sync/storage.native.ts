import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { DurableStorage } from './storage';
let database: SQLiteDatabase | undefined;
function db() {
  if (!database) {
    database = openDatabaseSync('rulocked-offline.db');
    database.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS durable_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  }
  return database;
}
/** A single SQLite row atomically commits the account snapshot and its outbox. */
export const durableStorage: DurableStorage = {
  get: key => db().getFirstSync<{ value: string }>('SELECT value FROM durable_state WHERE key = ?', key)?.value ?? null,
  set: (key, value) => { db().runSync('INSERT INTO durable_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value); },
  remove: key => { db().runSync('DELETE FROM durable_state WHERE key = ?', key); },
};
