#!/usr/bin/env node
/** Shrink-only typecheck for Storybook story fixtures (guardrail gap: JOV-6975). */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureMinHeapMb,
  WEB_TEST_TYPECHECK_HEAP_MB,
} from './lib/web-test-selectors.mjs';
import { evaluateTypecheckBaseline } from './typecheck-scripts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULT_BASELINE_PATH = resolve(
  ROOT,
  'apps/web/typecheck-stories-baseline.json'
);
export const DEFAULT_TSCONFIG_PATH = resolve(
  ROOT,
  'apps/web/tsconfig.stories.json'
);

function baselinePath() {
  return process.env.WEB_STORIES_TYPECHECK_BASELINE_PATH
    ? resolve(process.env.WEB_STORIES_TYPECHECK_BASELINE_PATH)
    : DEFAULT_BASELINE_PATH;
}

function tsconfigPath() {
  return process.env.WEB_STORIES_TYPECHECK_TSCONFIG_PATH
    ? resolve(process.env.WEB_STORIES_TYPECHECK_TSCONFIG_PATH)
    : DEFAULT_TSCONFIG_PATH;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  evaluateTypecheckBaseline({
    prefix: 'web-stories-typecheck',
    baselineFile: baselinePath(),
    tsconfig: tsconfigPath(),
    extraArgs: ['--noEmit', '--incremental'],
    pretty: false,
    updateCommand: 'pnpm --filter @jovie/web run typecheck:stories:update',
    tool: 'scripts/typecheck-web-stories.mjs',
    env: ensureMinHeapMb(process.env, WEB_TEST_TYPECHECK_HEAP_MB),
  });
}
