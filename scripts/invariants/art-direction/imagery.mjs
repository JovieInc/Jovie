/**
 * Imagery stages are fresh, generated, and verified (docs/marketing/IMAGERY.md).
 *
 * For every stage in apps/web/lib/imagery/stages.ts:
 * 1. Plate: both files exist under the byte budget, carry a sidecar that names
 *    the stage's accent and `subject: abstract`, and the manifest's plate spec
 *    hash matches the stage light, quiet zone and recipe. Stale plate:
 *    `pnpm --filter @jovie/web imagery:plate --stale`.
 * 2. Stage: the manifest's spec hash matches the stage spec and the rendered
 *    hash of every product shot it composites. Stale stage:
 *    `pnpm --filter @jovie/web imagery:verify --stale`.
 * 3. Verified: desktop and mobile verdicts exist, were judged (Clef and the
 *    dogfood judge, not `--no-judge`), name an image hash and a time, and pass.
 *    An unverified asset fails.
 * 4. No orphans: manifest entries without a registered stage fail.
 *
 * One command fixes all three: `pnpm --filter @jovie/web imagery:regen`.
 * Pixel-level rules (smoothness, single hue, orange) stay in images.mjs.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  hashPlateSpec,
  hashStageSpec,
} from '../../../apps/web/scripts/imagery/spec-hash.mjs';
import { REPO_ROOT } from './paths.mjs';

export const IMAGERY_MANIFEST = 'apps/web/lib/imagery/imagery.manifest.json';
export const IMAGERY_STAGES_FILE = 'apps/web/lib/imagery/stages.ts';
const SHOT_MANIFEST = 'apps/web/lib/screenshots/product-shots.manifest.json';
const PLATE_DIR = 'apps/web/public/assets/generated';
const JUDGES = ['clef', 'dogfood'];

const readJson = (repoRoot, rel) =>
  JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));

export function verdictFailures(id, viewport, verdict) {
  const label = `${id} ${viewport}`;
  if (!verdict) {
    return [
      `${label}: unverified, no verdict recorded. Run: pnpm --filter @jovie/web imagery:verify --stale`,
    ];
  }
  const failures = [];
  const judge = String(verdict.judge ?? '');
  const missing = JUDGES.filter(name => !judge.includes(name));
  if (missing.length) {
    failures.push(
      `${label}: unjudged, verdict lacks ${missing.join(' and ')} (judge: "${judge}")`
    );
  }
  if (!verdict.imageHash || !verdict.at || !verdict.model) {
    failures.push(`${label}: verdict is missing imageHash, at or model`);
  }
  if (verdict.pass !== true) {
    const findings =
      (verdict.findings ?? []).join('; ') || 'no findings listed';
    failures.push(`${label}: verification failed: ${findings}`);
  }
  return failures;
}

export function stageFailures(stage, manifest, shotManifest, repoRoot) {
  const failures = [];
  const plate = manifest.plates?.[stage.plate.id];
  if (!plate) {
    failures.push(
      `${stage.id}: plate ${stage.plate.id} was never generated. Run: pnpm --filter @jovie/web imagery:plate --stale`
    );
  } else {
    if (plate.specHash !== hashPlateSpec(stage)) {
      failures.push(
        `${stage.id}: plate is stale, the light, quiet zone or recipe changed. Run: pnpm --filter @jovie/web imagery:plate --stale`
      );
    }
    for (const format of ['avif', 'webp']) {
      const rel = `${PLATE_DIR}/${stage.plate.id}.${format}`;
      const file = join(repoRoot, rel);
      if (!existsSync(file)) {
        failures.push(`${stage.id}: ${rel} is missing`);
        continue;
      }
      if (statSync(file).size > 90 * 1024) {
        failures.push(`${stage.id}: ${rel} is over the 90 KB plate budget`);
      }
      const sidecar = `${file}.meta.json`;
      if (!existsSync(sidecar)) {
        failures.push(`${stage.id}: ${rel}.meta.json is missing`);
        continue;
      }
      const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
      if (meta.accent !== stage.plate.accent || meta.subject !== 'abstract') {
        failures.push(
          `${stage.id}: ${rel}.meta.json must declare accent ${stage.plate.accent} and subject abstract`
        );
      }
    }
  }
  for (const layer of stage.layers) {
    if (!shotManifest[layer.shotId]) {
      failures.push(
        `${stage.id}: layer shot ${layer.shotId} is not rendered in product-shots.manifest.json`
      );
    }
  }
  const entry = manifest.stages?.[stage.id];
  if (!entry) {
    failures.push(
      `${stage.id}: unverified, stage not in the manifest. Run: pnpm --filter @jovie/web imagery:verify --stale`
    );
    return failures;
  }
  if (entry.specHash !== hashStageSpec(stage, shotManifest)) {
    failures.push(
      `${stage.id}: stale, the stage spec or a shot it shows changed since it was verified. Run: pnpm --filter @jovie/web imagery:verify --stale`
    );
  }
  for (const viewport of ['desktop', 'mobile']) {
    failures.push(
      ...verdictFailures(stage.id, viewport, entry.verdicts?.[viewport])
    );
  }
  return failures;
}

export async function loadStages(repoRoot) {
  const loaded = await import(
    pathToFileURL(join(repoRoot, IMAGERY_STAGES_FILE)).href
  );
  return loaded.IMAGERY_STAGES;
}

export async function check(repoRoot = REPO_ROOT) {
  const failures = [];
  const manifestPath = join(repoRoot, IMAGERY_MANIFEST);
  if (!existsSync(manifestPath)) {
    return { failures: [`${IMAGERY_MANIFEST} is missing`] };
  }
  const manifest = readJson(repoRoot, IMAGERY_MANIFEST);
  const shotManifest = readJson(repoRoot, SHOT_MANIFEST).shots ?? {};
  const stages = await loadStages(repoRoot);
  for (const stage of stages) {
    failures.push(...stageFailures(stage, manifest, shotManifest, repoRoot));
  }
  const stageIds = new Set(stages.map(stage => stage.id));
  const plateIds = new Set(stages.map(stage => stage.plate.id));
  for (const id of Object.keys(manifest.stages ?? {})) {
    if (!stageIds.has(id))
      failures.push(`${id}: manifest stage has no registered stage`);
  }
  for (const id of Object.keys(manifest.plates ?? {})) {
    if (!plateIds.has(id))
      failures.push(`${id}: manifest plate has no registered stage`);
  }
  return { failures };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { failures } = await check();
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('imagery: ok\n');
  }
}
