import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { demoOrigin } from './network.mjs';
const { host } = demoOrigin();
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const directory = existsSync('.local.nosync/source/app') ? '.local.nosync/source' : '.';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, directory, '--hostname', host, '--port', process.env.PORT || '3107'], { stdio: 'inherit', env: process.env });
const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], { stdio: 'inherit', env: process.env });
let closing = false;
function stop(code = 0) { if (closing) return; closing = true; app.kill('SIGTERM'); worker.kill('SIGTERM'); setTimeout(() => process.exit(code), 500).unref(); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
app.on('exit', code => stop(code || 0)); worker.on('exit', code => stop(code || 0));
