#!/usr/bin/env node
// Copies the few monorepo files that apps/web reads at request time into
// apps/web/runtime-data/. Vercel's project root is apps/web, so traced files
// outside it break deployment extraction (prod frozen 2026-09-21..26); the
// tracing includes in next.config.js point here instead.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RUNTIME_DATA_FILES = Object.freeze([
  'CHANGELOG.md',
  'docs/FEATURE_REGISTRY.md',
  'scripts/symphony/symphony-codex-account-control.py',
  'apps/eve-pilot/identities/jovie/instructions.md',
  'apps/eve-pilot/identities/summer/instructions.md',
]);

const appRoot = join(import.meta.dirname, '..');
const repoRoot = join(appRoot, '..', '..');

for (const file of RUNTIME_DATA_FILES) {
  const target = join(appRoot, 'runtime-data', file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(repoRoot, file), target);
}
console.log(`[stage-runtime-data] staged ${RUNTIME_DATA_FILES.length} files`);
