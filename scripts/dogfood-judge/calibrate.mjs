// Calibration loop: the judge is scored against Tim's own verdicts.
//
// Eval set: scripts/dogfood-judge/calibration/cases.jsonl, one case per frame
// Tim approved or rejected (with his words and the criteria his rejection maps
// to). Positive class = reject. A case Tim rejected that the judge passes is a
// MISS: that is the KPI ("Tim never has to point out the obvious").
//
// When Tim gives feedback on something the judge passed, `cli.mjs miss` adds
// the frame here and to the taste-label set, so the next calibration (and the
// next judge prompt revision) includes it.

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { wilsonLower } from '../invariants/art-direction/vision-calibration.mjs';
import { judgeRun } from './judge.mjs';
import { REPO_ROOT, readSurfaces } from './registry.mjs';
import { CRITERION_IDS, RUBRIC_VERSION } from './rubric.mjs';

export const CASES_PATH = 'scripts/dogfood-judge/calibration/cases.jsonl';
export const METRICS_PATH = 'scripts/dogfood-judge/calibration/metrics.json';
export const RESULTS_PATH = 'scripts/dogfood-judge/calibration/results.jsonl';
export const IMAGE_DIR = 'docs/screenshots/dogfood-judge/calibration';
export const FLOORS = Object.freeze({
  precisionMin: 0.9,
  recallMin: 0.8,
  minRejects: 20,
  minApproves: 20,
});
const ID = /^[a-z0-9][a-z0-9-]{2,60}$/u;

export function readCases(path = join(REPO_ROOT, CASES_PATH)) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

export function validateCase(c) {
  const errors = [];
  if (!ID.test(c.id ?? '')) errors.push('id must be a lowercase slug');
  if (!['reject', 'approve'].includes(c.truth))
    errors.push('truth must be reject or approve');
  if (!Array.isArray(c.images) || c.images.length === 0)
    errors.push('images[] required');
  if (!c.words || !c.source)
    errors.push(
      "words and source required (Tim's own words, where they came from)"
    );
  for (const id of c.expect ?? [])
    if (!CRITERION_IDS.includes(id)) errors.push(`unknown criterion ${id}`);
  if (c.truth === 'reject' && !(c.expect ?? []).length)
    errors.push('a reject names at least one expected criterion');
  return errors;
}

/**
 * Score judge predictions against Tim's truth. Positive = reject.
 * @param {Array<{ id: string, truth: 'reject'|'approve', expect?: string[], predicted: 'fail'|'pass', criteria: string[] }>} rows
 */
export function score(rows) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let expected = 0;
  let found = 0;
  for (const row of rows) {
    const reject = row.truth === 'reject';
    const flagged = row.predicted === 'fail';
    if (reject && flagged) tp += 1;
    else if (!reject && flagged) fp += 1;
    else if (reject && !flagged) fn += 1;
    else tn += 1;
    if (reject) {
      for (const id of row.expect ?? []) {
        expected += 1;
        if (row.criteria.includes(id)) found += 1;
      }
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const rejects = tp + fn;
  const approves = fp + tn;
  return {
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    precisionLower95: tp + fp ? wilsonLower(tp, tp + fp) : 0,
    recallLower95: tp + fn ? wilsonLower(tp, tp + fn) : 0,
    criterionRecall: expected ? found / expected : 0,
    misses: rows
      .filter(r => r.truth === 'reject' && r.predicted === 'pass')
      .map(r => r.id),
    falseAlarms: rows
      .filter(r => r.truth === 'approve' && r.predicted === 'fail')
      .map(r => r.id),
    rejects,
    approves,
    meetsFloors:
      precision >= FLOORS.precisionMin &&
      recall >= FLOORS.recallMin &&
      rejects >= FLOORS.minRejects &&
      approves >= FLOORS.minApproves,
    sampleShortfall: {
      rejects: Math.max(0, FLOORS.minRejects - rejects),
      approves: Math.max(0, FLOORS.minApproves - approves),
    },
  };
}

function caseManifest(c, outDir) {
  return {
    surface: c.surface ?? 'calibration case',
    runDir: resolve(REPO_ROOT, IMAGE_DIR),
    videos: [],
    unjudgeable: [],
    steps: [
      {
        id: c.id,
        title: c.title ?? c.id,
        url: null,
        video: null,
        images: c.images.map((path, index) => ({
          name: `${c.id}-${index + 1}`,
          path: resolve(REPO_ROOT, path),
          t: null,
          source: 'calibration',
        })),
      },
    ],
    outDir,
  };
}

export async function calibrate({ casesPath, only, log = () => {} } = {}) {
  const registry = readSurfaces();
  const cases = readCases(casesPath ? resolve(casesPath) : undefined).filter(
    c => !only || only.split(',').includes(c.id)
  );
  const bad = cases.flatMap(c => validateCase(c).map(e => `${c.id}: ${e}`));
  if (bad.length)
    throw new Error(`invalid calibration cases:\n${bad.join('\n')}`);
  const rows = [];
  let costUsd = 0;
  const outRoot = join(REPO_ROOT, '.context/dogfood-judge/calibration');
  for (const c of cases) {
    const outDir = join(outRoot, c.id);
    mkdirSync(join(outDir, 'frames'), { recursive: true });
    const penRefs = (c.penRefs ?? []).map(p => ({
      id: p.id,
      title: p.title,
      absPath: resolve(REPO_ROOT, p.path),
    }));
    log(`calibrate ${c.id} (Tim: ${c.truth})`);
    const result = await judgeRun({
      manifest: caseManifest(c, outDir),
      penRefs,
      tiers: registry.judge.tiers,
      outDir,
      log,
    });
    costUsd += result.costUsd;
    const step = result.steps[0];
    rows.push({
      id: c.id,
      truth: c.truth,
      expect: c.expect ?? [],
      predicted: step.verdict,
      criteria: [...new Set(step.findings.map(f => f.criterion))],
      findings: step.findings.map(({ criterion, severity, detail }) => ({
        criterion,
        severity,
        detail,
      })),
      tier: step.tier,
      screenVerdict: step.screenVerdict ?? step.verdict,
      costUsd: result.costUsd,
    });
  }
  const summary = {
    schema: 'jovie.dogfood-judge-calibration/v1',
    rubricVersion: RUBRIC_VERSION,
    tiers: registry.judge.tiers,
    measuredAt: new Date().toISOString(),
    cases: rows.length,
    costUsd: Number(costUsd.toFixed(4)),
    costPerCaseUsd: rows.length
      ? Number((costUsd / rows.length).toFixed(4))
      : 0,
    ...score(rows),
    screenTierOnly: score(
      rows.map(r => ({ ...r, predicted: r.screenVerdict }))
    ),
    coldPassOnly: score(
      rows.map(r => ({
        ...r,
        predicted: r.findings.some(f => f.criterion === 'COLD')
          ? 'fail'
          : 'pass',
      }))
    ),
    rubricOnly: score(
      rows.map(r => ({
        ...r,
        predicted:
          r.findings.some(
            f => f.criterion !== 'COLD' && f.severity === 'blocker'
          ) ||
          r.findings.filter(
            f => f.criterion !== 'COLD' && f.severity === 'major'
          ).length >= 2
            ? 'fail'
            : 'pass',
      }))
    ),
  };
  if (!only) {
    writeFileSync(
      join(REPO_ROOT, METRICS_PATH),
      `${JSON.stringify(summary, null, 2)}\n`
    );
    writeFileSync(
      join(REPO_ROOT, RESULTS_PATH),
      rows.map(r => JSON.stringify(r)).join('\n') + '\n'
    );
  }
  return { summary, rows };
}

/** Publish judge precision/recall where Summer reads: gbrain + the checked-in metrics file. */
export function publishMetrics({ summary }, log = () => {}) {
  const slug = `metrics/dogfood-judge-calibration-${summary.measuredAt.slice(0, 10)}`;
  const page = `---
type: metric
title: "Dogfood judge calibration ${summary.measuredAt.slice(0, 10)}"
tags: [dogfood-judge, calibration, kpi]
---

# Dogfood judge vs Tim (${summary.rubricVersion})

KPI: Tim never has to point out the obvious. A miss is a frame Tim rejected that the judge passed.

| Metric | Value |
|---|---|
| Recall (rejects caught) | ${(summary.recall * 100).toFixed(0)}% (95% lower ${(summary.recallLower95 * 100).toFixed(0)}%) |
| Precision | ${(summary.precision * 100).toFixed(0)}% (95% lower ${(summary.precisionLower95 * 100).toFixed(0)}%) |
| Criterion recall | ${(summary.criterionRecall * 100).toFixed(0)}% |
| Misses | ${summary.misses.join(', ') || 'none'} |
| False alarms | ${summary.falseAlarms.join(', ') || 'none'} |
| Cases | ${summary.rejects} rejects, ${summary.approves} approves (floor ${FLOORS.minRejects}/${FLOORS.minApproves}) |
| Screen tier alone | recall ${(summary.screenTierOnly.recall * 100).toFixed(0)}%, precision ${(summary.screenTierOnly.precision * 100).toFixed(0)}% |
| Cold screenshot test alone | recall ${((summary.coldPassOnly?.recall ?? 0) * 100).toFixed(0)}%, precision ${((summary.coldPassOnly?.precision ?? 0) * 100).toFixed(0)}% |
| Rubric alone | recall ${((summary.rubricOnly?.recall ?? 0) * 100).toFixed(0)}%, precision ${((summary.rubricOnly?.precision ?? 0) * 100).toFixed(0)}% |
| Cost | $${summary.costUsd} total, $${summary.costPerCaseUsd} per case |
| Tiers | screen ${summary.tiers.screen}, confirm ${summary.tiers.confirm} |

Source: JovieInc/Jovie ${METRICS_PATH}.
`;
  try {
    execFileSync('gbrain', ['put', slug], {
      input: page,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log(`published ${slug} to gbrain`);
  } catch (error) {
    log(`gbrain-unavailable: ${String(error?.stderr ?? error).slice(0, 200)}`);
  }
}

/**
 * Tim gave feedback on something the judge passed: record it as a miss in the
 * eval set and the taste-label set (the canonical store of Tim's verdicts).
 */
export function recordMiss({
  id,
  image,
  words,
  criteria,
  surface,
  source = 'Tim feedback on a judge-passed run',
}) {
  if (!ID.test(id ?? '')) throw new Error('--id must be a lowercase slug');
  if (!image || !existsSync(image))
    throw new Error(
      '--image must be an existing file (copy pasted screenshots out of TemporaryItems first)'
    );
  if (!words) throw new Error("--words is required: Tim's own words");
  const expect = String(criteria ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const dest = join(IMAGE_DIR, `${id}${extname(image) || '.png'}`);
  mkdirSync(join(REPO_ROOT, IMAGE_DIR), { recursive: true });
  copyFileSync(image, join(REPO_ROOT, dest));
  const row = {
    id,
    surface: surface ?? null,
    truth: 'reject',
    images: [dest],
    words,
    source,
    expect,
    origin: 'judge-miss',
    at: new Date().toISOString(),
  };
  const errors = validateCase(row);
  if (errors.length) throw new Error(errors.join('; '));
  appendFileSync(join(REPO_ROOT, CASES_PATH), `${JSON.stringify(row)}\n`);
  let tasteLabel = 'skipped';
  try {
    execFileSync(
      'node',
      [
        'scripts/invariants/art-direction/taste-labels.mjs',
        'add',
        '--id',
        id,
        '--surface',
        surface ?? 'dogfood judge run',
        '--verdict',
        'reject',
        '--words',
        words,
        '--source',
        `dogfood-judge miss: ${source}`,
        '--image',
        join(REPO_ROOT, dest),
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' }
    );
    tasteLabel = 'added';
  } catch (error) {
    tasteLabel = `failed: ${String(error?.stderr ?? error).slice(0, 200)}`;
  }
  return {
    recorded: row,
    tasteLabel,
    next: 'run `cli.mjs calibrate` and add a rubric example for this criterion if the judge still misses it',
  };
}
