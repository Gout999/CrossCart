import postgres from 'postgres';
import { Store, getStore } from './store';
import { Commerce } from './service';
import { AppError } from './types';

type Snapshot = { records: { kind: string; id: string; data: string }[]; events: { id: string; run_id: string; data: string }[]; jobs: { run_id: string; due_at: number; lease_until: number; token: string | null }[]; webhook_events: { id: string; received_at: string }[] };
const empty = (): Snapshot => ({ records: [], events: [], jobs: [], webhook_events: [] });
let connection: ReturnType<typeof postgres> | undefined;
let initialized: Promise<unknown> | undefined;
export const cloudMode = () => process.env.CROSSCART_PUBLIC_DEMO === 'true';
function database() {
  if (!process.env.DATABASE_URL) throw new AppError(503, 'Cloud ledger is not configured. No transaction was executed.');
  return connection ??= postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 20, connect_timeout: 10, ssl: { rejectUnauthorized: true }, prepare: false, onnotice: () => {} });
}
export function snapshot(store: Store): Snapshot {
  return {
    records: store.db.prepare('SELECT kind,id,data FROM records ORDER BY rowid').all() as Snapshot['records'],
    events: store.db.prepare('SELECT id,run_id,data FROM events ORDER BY rowid').all() as Snapshot['events'],
    jobs: store.db.prepare('SELECT run_id,due_at,lease_until,token FROM jobs ORDER BY rowid').all() as Snapshot['jobs'],
    webhook_events: store.db.prepare('SELECT id,received_at FROM webhook_events ORDER BY rowid').all() as Snapshot['webhook_events'],
  };
}
export function hydrate(state: Snapshot): Store {
  const store = new Store(':memory:');
  store.atomic(() => {
    for (const r of state.records) store.db.prepare('INSERT INTO records VALUES (?,?,?)').run(r.kind, r.id, r.data);
    for (const r of state.events) store.db.prepare('INSERT INTO events VALUES (?,?,?)').run(r.id, r.run_id, r.data);
    for (const r of state.jobs) store.db.prepare('INSERT INTO jobs VALUES (?,?,?,?)').run(r.run_id, r.due_at, r.lease_until, r.token);
    for (const r of state.webhook_events) store.db.prepare('INSERT INTO webhook_events VALUES (?,?)').run(r.id, r.received_at);
  });
  return store;
}
// Keep the verified synchronous coordinator unchanged. Each bounded cloud stage
// loads an isolated working ledger while holding the PostgreSQL row lock, then
// commits its complete snapshot. SQLite memory is never the durable cloud source.
export async function withLedger<T>(fn: (store: Store) => Promise<T> | T): Promise<T> {
  if (!cloudMode()) return fn(getStore());
  const sql = database();
  await (initialized ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS crosscart_ledger (id text PRIMARY KEY, state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO crosscart_ledger(id,state) VALUES ('hakku-demo-v1',${sql.json(empty())}) ON CONFLICT(id) DO NOTHING`;
  })().catch(error => { initialized = undefined; throw error; }));
  return sql.begin(async tx => {
    await tx`SET LOCAL lock_timeout = '10s'`;
    await tx`SET LOCAL idle_in_transaction_session_timeout = '110s'`;
    const [row] = await tx<{ state: Snapshot }[]>`SELECT state FROM crosscart_ledger WHERE id='hakku-demo-v1' FOR UPDATE`;
    const store = hydrate(row.state);
    try {
      const result = await fn(store);
      const state = snapshot(store);
      if (JSON.stringify(state) !== JSON.stringify(row.state)) await tx`UPDATE crosscart_ledger SET state=${tx.json(state)},revision=revision+1,updated_at=now() WHERE id='hakku-demo-v1'`;
      return result;
    } finally { store.close(); }
  }) as Promise<T>;
}

export async function drainCloudJobs(milliseconds = 55_000) {
  if (!cloudMode()) return;
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const worked = await withLedger(store => new Commerce(store).processOne());
    if (!worked) return;
    const pending = await withLedger(store => {
      const jobs = store.db.prepare('SELECT run_id,due_at FROM jobs ORDER BY due_at').all() as { run_id: string; due_at: number }[];
      return jobs.filter(job => store.get<{ stage: string; providerState?: string }>('run', job.run_id)?.stage !== 'WAIT_AUTH');
    });
    // Await external card authorization through the signed webhook or next poll.
    if (!pending.length) return;
    const next = Math.min(...pending.map(j => j.due_at));
    if (next > Date.now()) await new Promise(resolve => setTimeout(resolve, Math.min(next - Date.now(), 2000)));
  }
}
export async function closeCloudLedger() { if (connection) await connection.end({ timeout: 2 }); connection = undefined; initialized = undefined; }
