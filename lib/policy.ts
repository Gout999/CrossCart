import { createHash } from 'node:crypto';
import { AppError } from './types';
import type { Intent, Mandate, Offer, Run } from './types';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function mandateHash(m: Omit<Mandate, 'hash'> | Mandate) {
  const { id, version, offer, expiresAt, ownerId, agentId } = m;
  return hash({ id, version, offer, expiresAt, ownerId, agentId });
}
export function dateInHongKong(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function deliveryDefault(now = new Date()) { return dateInHongKong(new Date(now.getTime() + 2 * 86400000)); }
export function parseIntent(text: string, fields?: Partial<Intent>): Intent {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new AppError(400, 'Enter a shopping request of 1–2000 characters.');
  const number = text.match(/(?:HK\$|\$|預算|预算)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:以下|以內|以内|蚊|港元)/)?.[1];
  const budgetMinor = fields?.budgetMinor ?? (number ? Math.round(Number(number.replaceAll(',', '')) * 100) : 180000);
  if (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0 || budgetMinor > 10000000) throw new AppError(400, 'Budget must be a positive integer in HKD minor units.');
  const deliveryBefore = fields?.deliveryBefore || text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || deliveryDefault();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryBefore) || Number.isNaN(Date.parse(deliveryBefore))) throw new AppError(400, 'Use a valid delivery date.');
  const officialWarranty = fields?.officialWarranty ?? !/(?:接受第三方|third.party.*(?:okay|ok)|any warranty)/i.test(text);
  const softPreferences = [/降噪|noise.cancel/i.test(text) ? 'noise cancellation' : '', /黑色|graphite|black/i.test(text) ? 'dark colour' : '', /音質|音质|sound quality/i.test(text) ? 'sound quality' : ''].filter(Boolean);
  return { text: text.trim(), budgetMinor, officialWarranty, deliveryBefore, parser: 'deterministic', softPreferences, explanation: 'Deterministic fallback. Confirm or edit these hard constraints before selecting an offer.' };
}
export function reasons(offer: Offer, intent: Intent) {
  const failures: string[] = [];
  if (!Number.isSafeInteger(offer.totalMinor) || !Number.isSafeInteger(offer.subtotalMinor) || !Number.isSafeInteger(offer.shippingMinor) || offer.totalMinor !== offer.subtotalMinor + offer.shippingMinor) failures.push('Total price unknown or invalid');
  if (offer.currency !== 'hkd') failures.push('Currency unknown or incompatible');
  if (offer.totalMinor > intent.budgetMinor) failures.push('Over total budget');
  if (intent.officialWarranty && offer.warranty !== 'official') failures.push('Different warranty');
  if (!offer.warranty) failures.push('Warranty unknown');
  if (!offer.deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(offer.deliveryDate)) failures.push('Delivery date unknown');
  if (offer.deliveryDate > intent.deliveryBefore) failures.push('Delivery after deadline');
  return failures;
}
export function validateMandate(run: Run, offer: Offer, now = Date.now()): string | undefined {
  const m = run.mandate;
  if (!m || !run.approval) return 'Explicit approval required';
  if (m.hash !== mandateHash(m) || run.approval.hash !== m.hash || run.approval.mandateId !== m.id || run.approval.actor !== run.ownerId) return 'Mandate integrity or approval mismatch';
  if (run.approval.revokedAt) return 'Approval revoked';
  if (Date.parse(m.expiresAt) <= now) return 'Mandate expired';
  if (canonical(m.offer) !== canonical(offer)) return 'Offer changed. Fresh approval required';
  if (reasons(offer, run.intent).length) return 'Offer no longer meets hard constraints';
  if (!Number.isSafeInteger(offer.totalMinor) || offer.totalMinor !== offer.subtotalMinor + offer.shippingMinor || offer.currency !== 'hkd' || offer.quantity !== 1) return 'Invalid amount or offer';
}
