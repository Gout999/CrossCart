import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { STRIPE_EVENTS } from '../lib/webhooks';
import { demoOrigin } from './network.mjs';

const key = process.env.STRIPE_SECRET_KEY;
if (!/^(sk|rk)_test_/.test(key || '')) throw new Error('A Stripe TEST key is required.');
const { url: base } = demoOrigin();
const env = { ...process.env, STRIPE_API_KEY: key };
const signing = await new Promise<string>((resolve, reject) => {
  const child = spawn('stripe', ['listen', '--print-secret', '--skip-update'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; const collect = (data: Buffer) => { output += data.toString(); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  child.on('error', () => reject(new Error('Install the official Stripe CLI before starting the listener.')));
  child.on('exit', code => { const secret = output.match(/whsec_[A-Za-z0-9]+/)?.[0]; if (code === 0 && secret) resolve(secret); else reject(new Error('Stripe listener could not obtain its signing secret. No raw credentials/errors are logged.')); });
});
let content = readFileSync('.env.local', 'utf8');
content = /^STRIPE_WEBHOOK_SECRET=/m.test(content) ? content.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${signing}`) : `${content}\nSTRIPE_WEBHOOK_SECRET=${signing}\n`;
writeFileSync('.env.local', content, { mode: 0o600 }); chmodSync('.env.local', 0o600);
console.log('Stripe CLI signing secret configured privately. Start/restart the app after configuration changes.');
if (!process.argv.includes('--configure-only')) {
  const folder = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-round2'; mkdirSync(folder, { recursive: true });
  const child = spawn('stripe', ['listen', '--skip-update', '--events', STRIPE_EVENTS.join(','), '--forward-to', `${base.origin}/api/webhooks/stripe`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const safeStream = () => {
    let pending = '';
    const flush = (line: string) => {
      const safe = line.replace(/whsec_[A-Za-z0-9]+/g, '[REDACTED SIGNING SECRET]').replaceAll(key!, '[REDACTED API KEY]');
      appendFileSync(`${folder}/stripe-listener.log`, safe); process.stdout.write(safe);
    };
    return { data: (data: Buffer) => { pending += data.toString(); let newline: number; while ((newline = pending.indexOf('\n')) >= 0) { flush(pending.slice(0, newline + 1)); pending = pending.slice(newline + 1); } }, end: () => { if (pending) flush(pending); } };
  };
  const stdout = safeStream(), stderr = safeStream();
  child.stdout.on('data', stdout.data); child.stdout.on('end', stdout.end);
  child.stderr.on('data', stderr.data); child.stderr.on('end', stderr.end);
  process.on('SIGINT', () => child.kill('SIGINT')); process.on('SIGTERM', () => child.kill('SIGTERM'));
  await new Promise<void>(resolve => child.on('exit', code => { process.exitCode = code || 0; resolve(); }));
}
