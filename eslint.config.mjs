import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([...next, ...ts, globalIgnores(['.next/**', '.local.nosync/*', '!.local.nosync/source/', '.local.nosync/source/.next/**', 'data/**', 'output/**', 'test-results/**', 'playwright-report/**'])]);
