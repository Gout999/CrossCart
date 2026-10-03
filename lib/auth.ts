import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Store } from './store';
import { AppError } from './types';
export const COOKIE = 'crosscart_demo_session';
interface Session { owner: string; expires: number; }
export function login(store: Store, account: string, password: string) {
  if (!['demo-buyer', 'demo-other'].includes(account) || typeof password !== 'string') throw new AppError(401, 'Invalid demo account.');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(digest(password), digest(process.env.DEMO_PASSWORD || 'crosscart-demo'))) throw new AppError(401, 'Invalid demo password.');
  const token = randomBytes(32).toString('hex');
  const owner = process.env.CROSSCART_PUBLIC_DEMO === 'true' ? `${account}:${randomUUID()}` : account;
  store.insert('session', digest(token).toString('hex'), { owner, expires: Date.now() + 12 * 3600000 });
  return token;
}
export function ownerFrom(store: Store, cookie: string | null) {
  const token = cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'Sign in to the local demo.');
  const session = store.get<Session>('session', createHash('sha256').update(token).digest('hex'));
  if (!session || session.expires <= Date.now()) throw new AppError(401, 'Demo session expired. Sign in again.');
  return session.owner;
}
export function sameOrigin(request: Request) {
  // Next may expose its internal localhost URL while the browser uses 127.0.0.1.
  // Compare to the configured public origin, never an arbitrary forwarded header.
  const expected = new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin;
  if (request.headers.get('origin') !== expected) throw new AppError(403, 'Same-origin request required.');
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError(415, 'JSON request required.');
}
