import { createHash } from 'node:crypto';
import type { Store } from './store';
import { AppError } from './types';
import { cloudMode } from './cloud-ledger';

export function publicQuota(store: Store, identity: string, category: 'login' | 'ai') {
  if (!cloudMode()) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${category}:${createHash('sha256').update(identity).digest('hex')}`;
  const globalKey = `${day}:${category}:global`;
  const limit = category === 'login' ? 30 : 20;
  const globalLimit = category === 'login' ? 500 : 100;
  store.atomic(() => {
    const personal = store.get<number>('quota', key) || 0;
    const global = store.get<number>('quota', globalKey) || 0;
    if (personal >= limit || global >= globalLimit) throw new AppError(429, 'Public demo allowance reached. Existing payment reconciliation remains available.');
    store.put('quota', key, personal + 1); store.put('quota', globalKey, global + 1);
  });
}
