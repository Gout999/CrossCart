import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const destination = resolve(process.argv[2] || '.local.nosync/publication');
if (destination === process.cwd()) throw new Error('Export must use a separate directory.');
mkdirSync(destination, { recursive: true });
const entries = ['app', 'lib', 'scripts', 'tests', 'public', 'docs', 'package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'eslint.config.mjs', 'playwright.config.ts', 'playwright.stripe.config.ts', 'playwright.restart.config.ts', '.gitignore', '.env.example', 'AGENTS.md', 'README.md', 'vercel.json'];
for (const entry of entries) if (existsSync(entry)) cpSync(realpathSync(entry), join(destination, entry), { recursive: true, dereference: true });
const files = [];
function walk(directory, relative = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = join(relative, entry.name);
    if (['.git', '.vercel', '.local.nosync', 'node_modules', '.next', 'data', 'test-results', 'playwright-report', 'output'].includes(entry.name) || entry.name.endsWith('.tsbuildinfo') || name === 'docs/source-manifest.json' || /^\.env(?!\.example$)/.test(entry.name)) continue;
    if (entry.isDirectory()) walk(join(directory, entry.name), name);
    else files.push({ path: name, sha256: createHash('sha256').update(readFileSync(join(directory, entry.name))).digest('hex') });
  }
}
walk(destination);
writeFileSync(join(destination, 'docs/source-manifest.json'), JSON.stringify({ exportedAt: new Date().toISOString(), files }, null, 2));
console.log(`Exported ${files.length} regular source/documentation files. Secrets, runtime, ledger and private evidence excluded.`);
