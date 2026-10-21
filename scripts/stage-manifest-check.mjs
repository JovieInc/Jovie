#!/usr/bin/env node
/**
 * Stage registration gate (docs/metrics/STAGE_EVENTS.md).
 *
 *   node scripts/stage-manifest-check.mjs
 *
 * Fails when docs/metrics/stage-manifest.json is structurally invalid, or when
 * a delivery workflow (controller, release, deploy, promote, TestFlight, App
 * Store, canary, rollback) is neither registered as a stage producer nor
 * exempted with a reason. A new pipeline stage is not done until it is
 * registered and measured.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStageManifest } from './lib/stage-events.mjs';

export const DELIVERY_WORKFLOW =
  /(controller|release|deploy|promot|testflight|app-store|canary|rollback)/i;

export function checkStageManifest({ repoRoot, manifest = null }) {
  const doc =
    manifest ??
    JSON.parse(
      readFileSync(
        resolve(repoRoot, 'docs/metrics/stage-manifest.json'),
        'utf8'
      )
    );
  const errors = [...validateStageManifest(doc).errors];
  const workflowsDir = resolve(repoRoot, '.github/workflows');
  const files = readdirSync(workflowsDir).filter(f => /\.ya?ml$/.test(f));
  const registered = doc.producers?.workflows ?? {};
  const exempt = doc.producers?.exempt ?? {};
  for (const file of files) {
    if (!DELIVERY_WORKFLOW.test(file)) continue;
    if (registered[file] || exempt[file]) continue;
    errors.push(
      `.github/workflows/${file}: delivery workflow is not registered in docs/metrics/stage-manifest.json producers (add its stages, or an exempt reason)`
    );
  }
  for (const file of [...Object.keys(registered), ...Object.keys(exempt)])
    if (!existsSync(resolve(workflowsDir, file)))
      errors.push(`producers: ${file} does not exist (stale registration)`);
  for (const [file, reason] of Object.entries(exempt))
    if (typeof reason !== 'string' || reason.trim().length < 10)
      errors.push(`producers.exempt.${file}: give a reason`);
  return errors;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = checkStageManifest({ repoRoot });
  for (const error of errors) console.error(`[stage-manifest] ✗ ${error}`);
  if (errors.length) process.exitCode = 1;
  else console.log('[stage-manifest] ✓ stages registered');
}
