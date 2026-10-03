import { timingSafeEqual } from 'node:crypto';
import { drainCloudJobs } from '../../../lib/cloud-ledger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(request: Request) {
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await drainCloudJobs(90_000);
  return Response.json({ checked: true }, { headers: { 'Cache-Control': 'no-store' } });
}
