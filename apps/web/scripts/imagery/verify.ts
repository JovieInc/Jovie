/**
 * Verifies stage composites cold and records a verdict per viewport.
 *
 *   pnpm --filter @jovie/web imagery:verify [--base-url URL] [--only id] [--stale] [--no-judge]
 *
 * Needs a running demo-mode server (the same one `shots:render` uses). For
 * each stage and each viewport (desktop 1440, mobile 390) it opens
 * `/demo/imagery/<stage>` in a fresh context (no cookies, no storage: cold),
 * checks the live geometry against the spec, screenshots only the stage, and
 * runs the judges (judges.ts: Clef, the dogfood cold screenshot test, the
 * dogfood taste rubric). The verdict { pass, findings, judge, model, at,
 * imageHash } is written to `lib/imagery/imagery.manifest.json`; the
 * art-direction guard (`imagery.mjs`) fails any stage without a current
 * passing verdict. Spec: docs/marketing/IMAGERY.md.
 *
 * `--no-judge` records geometry only and marks the verdict as unjudged, which
 * the guard rejects; it exists for layout work, not for shipping.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import {
  IMAGERY_STAGES,
  type ImageryStageSpec,
} from '../../lib/imagery/stages';
import { loadDogfoodRubric } from './dogfood-adapter.mjs';
import { type JudgeRun, type Rubric, runClef, runDogfood } from './judges';
import {
  type ImageryManifest,
  REPO_ROOT,
  readImageryManifest,
  readShotManifest,
  WEB_ROOT,
  writeImageryManifest,
} from './manifest';
import { hashStageSpec } from './spec-hash.mjs';
import {
  buildVerdict,
  geometryFindings,
  imageHash,
  type JudgeFinding,
  needsVerify,
  parseVerifyArgs,
  VERIFY_VIEWPORTS,
  type VerifyViewport,
} from './verify-core';

const OUT_DIR = path.join(WEB_ROOT, 'test-results/imagery');
const STAGE = '[data-imagery-stage]';

async function settle(page: Page) {
  await page.waitForSelector(STAGE, { timeout: 60_000 });
  await page.waitForFunction(
    () =>
      [...document.images].every(img => img.complete && img.naturalWidth > 0),
    undefined,
    { timeout: 60_000 }
  );
}

async function layerBoxes(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-imagery-stage]');
    if (!stage) return [];
    const s = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('[data-layer]')].map(el => {
      const r = el.getBoundingClientRect();
      const visible =
        getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
      return {
        shotId: el.dataset.layer ?? '',
        visible,
        box: {
          x: (r.left - s.left) / s.width,
          y: (r.top - s.top) / s.height,
          w: r.width / s.width,
          h: r.height / s.height,
        },
      };
    });
  });
}

async function verifyOne(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  stage: ImageryStageSpec,
  viewport: VerifyViewport,
  judge: boolean,
  rubric: Rubric | null
) {
  const context = await browser.newContext({
    viewport: VERIFY_VIEWPORTS[viewport],
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/demo/imagery/${stage.id}`, {
      waitUntil: 'networkidle',
    });
    await settle(page);
    const png = await page.locator(STAGE).first().screenshot({ type: 'png' });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, `${stage.id}-${viewport}.png`), png);

    const findings: JudgeFinding[] = geometryFindings(
      stage,
      viewport,
      await layerBoxes(page)
    );
    const runs: JudgeRun[] = [];
    if (judge) {
      runs.push(await runClef(`${stage.id}-${viewport}`, png, stage.waivers));
      runs.push(await runDogfood(rubric, png));
    } else {
      findings.push({
        source: 'judge',
        severity: 'blocker',
        detail: 'unjudged: run without --no-judge before shipping',
      });
    }
    for (const run of runs) findings.push(...run.findings);
    return buildVerdict(findings, {
      judge: ['geometry', ...runs.map(r => r.judge)].join('+'),
      model: runs.map(r => r.model).join(',') || 'none',
      at: new Date().toISOString(),
      imageHash: imageHash(png),
    });
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseVerifyArgs(process.argv.slice(2), process.env);
  const manifest: ImageryManifest = readImageryManifest();
  const shots = readShotManifest();
  let stages = IMAGERY_STAGES as readonly ImageryStageSpec[];
  if (args.only) stages = stages.filter(s => s.id === args.only);
  if (args.only && stages.length === 0) {
    throw new Error(`Unknown stage: ${args.only}`);
  }
  if (args.stale) stages = stages.filter(s => needsVerify(s, manifest, shots));
  if (stages.length === 0) {
    process.stdout.write('[imagery:verify] nothing to verify\n');
    return;
  }

  const loaded = args.judge ? await loadDogfoodRubric(REPO_ROOT) : null;
  if (args.judge && !loaded) {
    process.stderr.write(
      '[imagery:verify] dogfood rubric not found; verdicts will fail closed (PR #23746 or DOGFOOD_JUDGE_RUBRIC)\n'
    );
  }
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const stage of stages) {
      const verdicts: Record<string, ReturnType<typeof buildVerdict>> = {};
      for (const viewport of ['desktop', 'mobile'] as const) {
        const verdict = await verifyOne(
          browser,
          args.baseUrl,
          stage,
          viewport,
          args.judge,
          (loaded?.rubric as Rubric | undefined) ?? null
        );
        verdicts[viewport] = verdict;
        if (!verdict.pass) failed += 1;
        process.stdout.write(
          `[imagery:verify] ${stage.id} ${viewport}: ${verdict.pass ? 'pass' : 'FAIL'}\n${verdict.findings.map(f => `  - ${f}`).join('\n')}${verdict.findings.length ? '\n' : ''}`
        );
      }
      manifest.stages[stage.id] = {
        specHash: hashStageSpec(stage, shots),
        verdicts: verdicts as never,
      };
      writeImageryManifest(manifest);
    }
  } finally {
    await browser.close();
  }
  if (failed > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    process.stderr.write(`[imagery:verify] ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
