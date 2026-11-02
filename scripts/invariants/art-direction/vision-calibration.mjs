/**
 * Calibrates the Clef vision judges against labeled frames and decides which
 * may block. A judge blocks only when, on labeled data, precision >= 0.9 and
 * recall >= 0.8 (Hamel floors) AND the Wilson 95% lower bound of precision
 * still clears the floor with at least MIN_POSITIVES defects and MIN_NEGATIVES
 * clean frames labeled. Small samples can look perfect by luck; the interval
 * keeps them advisory.
 *
 *   node scripts/invariants/art-direction/vision-calibration.mjs          print the table
 *   node scripts/invariants/art-direction/vision-calibration.mjs label <key> <criterion> <defect|ok> <source> <evidence...>
 *
 * Every time Tim (or a machine measurement) accepts or rejects a frame the
 * reviewer appends a label here; the table and the promotion verdict update.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './paths.mjs';

const DIR = 'scripts/invariants/art-direction';
export const OBSERVATIONS = `${DIR}/vision-observations.jsonl`;
export const LABELS = `${DIR}/vision-labels.jsonl`;
export const TASTE_LABELS = 'docs/design-system/taste-labels/labels.jsonl';
export const MIN_POSITIVES = 20;
export const MIN_NEGATIVES = 20;
/** Criterion -> the answer word that flags a defect. */
export const CRITERIA = Object.freeze({
  polish: 'unpolished',
  hierarchy: 'muddled',
  mockup_quality: 'fake',
  text_on_busy: 'busy',
  cliche: 'present',
  contrast: 'low',
});
const JUDGE_CRITERION = Object.freeze({
  polish: 'polish',
  hierarchy: 'hierarchy',
  'mockup-quality': 'mockup_quality',
});

/** Judge labels carried by Tim's approve/reject rows; they join observations by row id. */
export function tasteJudgeLabels(root) {
  let rows = [];
  try {
    rows = readJsonl(root, TASTE_LABELS);
  } catch {
    return [];
  }
  return rows.flatMap(row =>
    (row.judgeLabels ?? []).map(j => ({
      key: row.id,
      judge: j.criterion,
      truth: j.truth,
      source: `taste-labels/${row.id}`,
      evidence: row.words,
    }))
  );
}

const readJsonl = (root, rel) =>
  readFileSync(join(root, rel), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

export function wilsonLower(successes, total, z = 1.96) {
  if (total === 0) return 0;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin =
    z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return (centre - margin) / denom;
}

export function measure(observations, labels) {
  const byKey = new Map(observations.map(o => [o.key, o]));
  const out = {};
  for (const [criterion, flag] of Object.entries(CRITERIA)) {
    let tp = 0,
      fp = 0,
      fn = 0,
      tn = 0,
      unmatched = 0;
    for (const label of labels.filter(l => l.judge === criterion)) {
      const answer = byKey.get(label.key)?.criteria?.[criterion];
      if (!answer) {
        unmatched += 1;
        continue;
      }
      const flagged = answer.split(' ')[0] === flag;
      const defect = label.truth === 'defect';
      if (flagged && defect) tp += 1;
      else if (flagged) fp += 1;
      else if (defect) fn += 1;
      else tn += 1;
    }
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    out[criterion] = {
      tp,
      fp,
      fn,
      tn,
      unmatched,
      positives: tp + fn,
      negatives: fp + tn,
      precision,
      recall,
      precisionLower95: tp + fp ? wilsonLower(tp, tp + fp) : 0,
    };
  }
  return out;
}

export function verdict(m, floors) {
  const why = [];
  if (m.positives < MIN_POSITIVES)
    why.push(`${m.positives}/${MIN_POSITIVES} labeled defects`);
  if (m.negatives < MIN_NEGATIVES)
    why.push(`${m.negatives}/${MIN_NEGATIVES} labeled clean frames`);
  if (m.precision === null || m.precision < floors.precisionMin)
    why.push(`precision ${fmt(m.precision)} < ${floors.precisionMin}`);
  if (m.precision !== null && m.precisionLower95 < floors.precisionMin)
    why.push(
      `precision 95% lower bound ${fmt(m.precisionLower95)} < ${floors.precisionMin}`
    );
  if (m.recall === null || m.recall < floors.recallMin)
    why.push(`recall ${fmt(m.recall)} < ${floors.recallMin}`);
  return { mayBlock: why.length === 0, why };
}

const fmt = value =>
  value === null || value === undefined ? 'n/a' : value.toFixed(2);

export function calibrate(root = REPO_ROOT, config) {
  const metrics = measure(readJsonl(root, OBSERVATIONS), [
    ...readJsonl(root, LABELS),
    ...tasteJudgeLabels(root),
  ]);
  const judges = {};
  for (const [criterion, m] of Object.entries(metrics)) {
    judges[criterion] = { ...m, ...verdict(m, config.hamelFloors) };
  }
  return judges;
}

/** Promotion is derived, never hand-set: a judge listed as blocking must pass its verdict. */
export function checkCalibration(root, config) {
  const failures = [];
  const judges = calibrate(root, config);
  const modes = config.judgeModes ?? {};
  for (const [judge, criterion] of Object.entries(JUDGE_CRITERION)) {
    if (modes[judge] === 'blocking' && !judges[criterion].mayBlock) {
      failures.push(
        `vision judge ${judge} is set to blocking but fails the floors: ${judges[criterion].why.join('; ')}`
      );
    }
  }
  const shadow = Object.entries(judges).map(([criterion, j]) => {
    const state = Object.entries(JUDGE_CRITERION).find(
      ([, c]) => c === criterion
    )?.[0];
    const mode = state ? (modes[state] ?? 'shadow') : 'advisory';
    return `vision ${criterion}: ${mode}; precision ${fmt(j.precision)} (95% lower ${fmt(j.precisionLower95)}), recall ${fmt(j.recall)}, ${j.positives} defects / ${j.negatives} clean labeled; ${j.unmatched ? `${j.unmatched} labeled but not yet judged; ` : ''}${j.mayBlock ? 'meets floors' : 'blocked from promotion: ' + j.why[0]}`;
  });
  return { failures, shadow, judges };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = JSON.parse(
    readFileSync(join(REPO_ROOT, DIR, 'vision.config.json'), 'utf8')
  );
  const [cmd, key, criterion, truth, source, ...evidence] =
    process.argv.slice(2);
  if (cmd === 'label') {
    if (
      !(criterion in CRITERIA) ||
      !['defect', 'ok'].includes(truth) ||
      !source ||
      evidence.length === 0
    ) {
      process.stderr.write(
        'usage: label <key> <criterion> <defect|ok> <source> <evidence...>\n'
      );
      process.exitCode = 2;
    } else {
      appendFileSync(
        join(REPO_ROOT, LABELS),
        JSON.stringify({
          key,
          judge: criterion,
          truth,
          source,
          evidence: evidence.join(' '),
        }) + '\n'
      );
    }
  } else {
    for (const line of checkCalibration(REPO_ROOT, config).shadow)
      process.stdout.write(`${line}\n`);
  }
}
