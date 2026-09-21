import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

let connection: DatabaseSync | undefined;
let openedPath: string | undefined;

export function db() {
  const filename = path.join(config().dataDir, 'comparison-lab.sqlite');
  if (connection && openedPath === filename) return connection;
  connection?.close();
  fs.mkdirSync(config().dataDir, { recursive: true, mode: 0o700 });
  connection = new DatabaseSync(filename);
  openedPath = filename;
  connection.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      verified_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otp_challenges (
      email TEXT PRIMARY KEY, name TEXT NOT NULL, digest TEXT NOT NULL, salt TEXT NOT NULL,
      expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_events (
      key TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rate_events_key_time ON rate_events(key, created_at);
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), providers_json TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      reviewed_at TEXT, review_note TEXT, review_token_hash TEXT NOT NULL UNIQUE,
      review_expires_at INTEGER NOT NULL, review_decision TEXT, report_slug TEXT, error TEXT,
      notes TEXT, consent_at TEXT, attribution_confirmed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS requests_user ON requests(user_id, created_at);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES requests(id),
      state TEXT NOT NULL, protocol_json TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0,
      fencing_token INTEGER NOT NULL DEFAULT 0, lease_token_hash TEXT,
      lease_expires_at INTEGER, heartbeat_at INTEGER, available_at INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT
    );
    CREATE TABLE IF NOT EXISTS reports (
      slug TEXT PRIMARY KEY, job_id TEXT UNIQUE REFERENCES jobs(id), title TEXT NOT NULL,
      summary_json TEXT NOT NULL, evidence_path TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report_access (
      user_id TEXT NOT NULL REFERENCES users(id), report_slug TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('view', 'download')),
      access_count INTEGER NOT NULL, first_access_at TEXT NOT NULL, last_access_at TEXT NOT NULL,
      last_notified_at INTEGER NOT NULL, notification_count INTEGER NOT NULL,
      PRIMARY KEY (user_id, report_slug, action)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL,
      subject TEXT NOT NULL, text_body TEXT NOT NULL, html_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempt INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL, lease_until INTEGER, sent_at TEXT,
      created_at TEXT NOT NULL, last_error TEXT
    );
  `);
  connection.exec('BEGIN IMMEDIATE');
  try {
    const requestColumns = new Set((connection.prepare('PRAGMA table_info(requests)').all() as { name: string }[]).map(column => column.name));
    for (const column of ['notes', 'consent_at', 'attribution_confirmed_at', 'tool_id', 'comparisons_json']) {
      if (!requestColumns.has(column)) connection.exec(`ALTER TABLE requests ADD COLUMN ${column} TEXT`);
    }
    const jobColumns = new Set((connection.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map(column => column.name));
    for (const column of ['reuse_json', 'completion_token_hash', 'completion_evidence_hash', 'completion_json']) {
      if (!jobColumns.has(column)) connection.exec(`ALTER TABLE jobs ADD COLUMN ${column} TEXT`);
    }
    const reportColumns = new Set((connection.prepare('PRAGMA table_info(reports)').all() as { name: string }[]).map(column => column.name));
    if (!reportColumns.has('generation_key')) connection.exec('ALTER TABLE reports ADD COLUMN generation_key TEXT');
    connection.exec('CREATE UNIQUE INDEX IF NOT EXISTS reports_generation_key ON reports(generation_key)');
    connection.exec('COMMIT');
  } catch (error) { connection.exec('ROLLBACK'); throw error; }
  try { fs.chmodSync(filename, 0o600); } catch { /* Some volume drivers omit chmod. */ }
  return connection;
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec('BEGIN IMMEDIATE');
  try { const result = fn(); conn.exec('COMMIT'); return result; }
  catch (error) { conn.exec('ROLLBACK'); throw error; }
}

export function closeDb() { connection?.close(); connection = undefined; openedPath = undefined; }
