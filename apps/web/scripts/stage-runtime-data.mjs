#!/usr/bin/env node
// Copies the few monorepo files that apps/web reads at request time into
// apps/web/runtime-data/. Vercel's project root is apps/web, so traced files
// outside it break deployment extraction (prod frozen 2026-09-21..26); the
// tracing includes in next.config.js point here instead.
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RUNTIME_DATA_FILES = Object.freeze([
  'CHANGELOG.md',
  'docs/FEATURE_REGISTRY.md',
  'apps/eve-pilot/identities/jovie/instructions.md',
  'apps/eve-pilot/identities/summer/instructions.md',
  // Funnel judge trend for the Ovie outbound readiness checklist.
  'scripts/funnel-judge/trend.jsonl',
]);

const appRoot = join(import.meta.dirname, '..');
const repoRoot = join(appRoot, '..', '..');

for (const file of RUNTIME_DATA_FILES) {
  const target = join(appRoot, 'runtime-data', file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(repoRoot, file), target);
}
// Certification packet files are written by overnight certification workers;
// the directory may not exist yet, which is zero packets, not an error.
export const RUNTIME_DATA_DIRECTORIES = Object.freeze(['docs/certification']);

for (const directory of RUNTIME_DATA_DIRECTORIES) {
  const source = join(repoRoot, directory);
  if (!existsSync(source)) continue;
  cpSync(source, join(appRoot, 'runtime-data', directory), {
    recursive: true,
    filter: path => !path.includes('node_modules'),
  });
}
console.log(`[stage-runtime-data] staged ${RUNTIME_DATA_FILES.length} files`);
