#!/usr/bin/env node
/** Shrink-only typecheck for the CI-matching web unit graph (JOV-5418). */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORITATIVE_WEB_UNIT_COMMAND,
  ensureMinHeapMb,
  WEB_TEST_TYPECHECK_HEAP_MB,
} from './lib/web-test-selectors.mjs';
import { evaluateTypecheckBaseline } from './typecheck-scripts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULT_BASELINE_PATH = resolve(
  ROOT,
  'apps/web/typecheck-tests-baseline.json'
);
export const DEFAULT_TSCONFIG_PATH = resolve(
  ROOT,
  'apps/web/tsconfig.test.json'
);

function baselinePath() {
  return process.env.WEB_TEST_TYPECHECK_BASELINE_PATH
    ? resolve(process.env.WEB_TEST_TYPECHECK_BASELINE_PATH)
    : DEFAULT_BASELINE_PATH;
}

function tsconfigPath() {
  return process.env.WEB_TEST_TYPECHECK_TSCONFIG_PATH
    ? resolve(process.env.WEB_TEST_TYPECHECK_TSCONFIG_PATH)
    : DEFAULT_TSCONFIG_PATH;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  evaluateTypecheckBaseline({
    prefix: 'web-test-typecheck',
    baselineFile: baselinePath(),
    tsconfig: tsconfigPath(),
    extraArgs: ['--noEmit', '--incremental'],
    extraBaselineFields: { selector: AUTHORITATIVE_WEB_UNIT_COMMAND },
    pretty: false,
    updateCommand: 'pnpm --filter @jovie/web run typecheck:tests:update',
    tool: 'scripts/typecheck-web-tests.mjs',
    env: ensureMinHeapMb(process.env, WEB_TEST_TYPECHECK_HEAP_MB),
  });
}
