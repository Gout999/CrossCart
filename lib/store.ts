import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, Run, WebhookReceipt } from './types';

// Covers refund stages plus authoritative receipt lookups and SDK connection retries.
export const JOB_LEASE_MS = 90_000;
export class Store {
  readonly db: DatabaseSync;
  constructor(path = process.env.CROSSCART_DB || 'data/crosscart.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (run_id TEXT PRIMARY KEY, due_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, token TEXT);
      CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_run ON events(run_id);`);
  }
  close() { this.db.close(); }
  atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as T : undefined;
  }
  put(kind: string, id: string, data: unknown) {
    this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind, id, JSON.stringify(data));
  }
  insert(kind: string, id: string, data: unknown) { this.db.prepare('INSERT INTO records VALUES (?,?,?)').run(kind, id, JSON.stringify(data)); }
  list<T>(kind: string): T[] { return (this.db.prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid DESC').all(kind) as { data: string }[]).map(r => JSON.parse(r.data)); }
  event(run: Run, previousState: string, reason: string, source = 'coordinator', providerReference?: string) {
    const event: AuditEvent = { id: randomUUID(), runId: run.id, timestamp: new Date().toISOString(), source, previousState, newState: `${run.status}/${run.paymentState}/${run.orderState}/${run.recoveryState}`, reason, providerReference };
    this.db.prepare('INSERT INTO events VALUES (?,?,?)').run(event.id, run.id, JSON.stringify(event));
  }
  events(id: string): AuditEvent[] { return (this.db.prepare('SELECT data FROM events WHERE run_id=? ORDER BY rowid').all(id) as { data: string }[]).map(e => JSON.parse(e.data)); }
  save(run: Run, reason: string, source?: string, reference?: string) {
    const previous = this.get<Run>('run', run.id);
    run.updatedAt = new Date().toISOString();
    this.put('run', run.id, run);
    this.event(run, previous ? `${previous.status}/${previous.paymentState}/${previous.orderState}/${previous.recoveryState}` : 'NEW', reason, source, reference);
  }
  enqueue(id: string, delay = 0) { this.db.prepare('INSERT INTO jobs(run_id,due_at) VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET due_at=MIN(jobs.due_at,excluded.due_at)').run(id, Date.now() + delay); }
  claim(): { id: string; token: string } | undefined {
    return this.atomic(() => {
      const row = this.db.prepare('SELECT run_id FROM jobs WHERE due_at<=? AND lease_until<? ORDER BY due_at LIMIT 1').get(Date.now(), Date.now()) as { run_id: string } | undefined;
      if (!row) return;
      const token = randomUUID();
      this.db.prepare('UPDATE jobs SET lease_until=?,token=? WHERE run_id=?').run(Date.now() + JOB_LEASE_MS, token, row.run_id);
      return { id: row.run_id, token };
    });
  }
  finish(id: string, token: string, done: boolean, delay = 0) {
    this.atomic(() => {
      if (done && !this.pendingWebhooks(id).length) this.db.prepare('DELETE FROM jobs WHERE run_id=? AND token=?').run(id, token);
      else this.db.prepare('UPDATE jobs SET lease_until=0, token=NULL, due_at=? WHERE run_id=? AND token=?').run(Date.now() + delay, id, token);
    });
  }
  pendingWebhooks(id: string) { return this.list<WebhookReceipt>('stripe_webhook').filter(r => r.runId === id && r.status === 'PENDING'); }
  webhookOnce(id: string) { return this.db.prepare('INSERT OR IGNORE INTO webhook_events VALUES (?,?)').run(id, new Date().toISOString()).changes === 1; }
}
let singleton: Store | undefined;
export function getStore() { return singleton ??= new Store(); }
