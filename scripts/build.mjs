import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const directory = existsSync('.local.nosync/source/app') ? '.local.nosync/source' : '.';
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', directory], { stdio: 'inherit' });
process.exit(result.status ?? 1);
