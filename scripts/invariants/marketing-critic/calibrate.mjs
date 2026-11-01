#!/usr/bin/env node
/**
 * Precision/recall of the marketing critic detectors against truth labels,
 * and the promotion verdict that decides which detector may block.
 * Mirrors scripts/invariants/art-direction/vision-calibration.mjs.
 *
 *   node scripts/invariants/marketing-critic/calibrate.mjs [--observations a.jsonl,b.jsonl] [--json]
 *   node scripts/invariants/marketing-critic/calibrate.mjs --check
 *   node scripts/invariants/marketing-critic/calibrate.mjs import-sweep <critic-1.jsonl> [...]
 *   node scripts/invariants/marketing-critic/calibrate.mjs label <route> <class> <defect|clean> <source> <evidence...>
 *
 * Unit of truth: (route, class). A detector predicts a defect on a route when
 * it fired at any width in the latest observed run of that route.
 * Detector precision = TP / (TP + FP) on labeled routes for its class.
 * Recall is measured for the class (union of its detectors), because one
 * class can need several detectors.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilsonLower } from '../art-direction/vision-calibration.mjs';
import { DETECTOR_CLASSES } from './detectors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LABELS_PATH = join(HERE, 'labels.jsonl');
export const OBSERVATIONS_PATH = join(HERE, 'observations.jsonl');
export const CONFIG_PATH = join(HERE, 'marketing-critic.config.json');
export const RUBRIC_PATH = join(
  HERE,
  '../../../docs/design-system/marketing-critic-rubric.json'
);

const readJsonl = path =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];

/** Sweep files name routes after screenshot files: "/alternatives_linktree" is "/alternatives/linktree". */
export const normalizeRoute = route =>
  route === '/'
    ? '/'
    : `/${route.replace(/^\//, '').replace(/_/g, '/')}`.replace(/\/+$/, '');

/**
 * Turn critic sweep rows into labels. Every flagged (route, class) becomes a
 * defect label; every swept route not flagged for a detectable class becomes
 * an implicit clean label (weaker evidence, marked as such), for classes the
 * sweep used at all.
 */
export function importSweep(rows, { classes, source, labeledAt }) {
  const flagged = new Map();
  const routes = new Set();
  for (const row of rows) {
    const route = normalizeRoute(row.route);
    routes.add(route);
    if (!classes.includes(row.class)) continue;
    const key = `${route}|${row.class}`;
    if (!flagged.has(key))
      flagged.set(key, {
        route,
        class: row.class,
        truth: 'defect',
        source,
        evidence: row.evidence,
        widths: row.widths,
        severity: row.severity,
        labeledAt,
      });
  }
  const labels = [...flagged.values()];
  // Implicit clean only for classes the critic actually used in this sweep.
  const swept = classes.filter(cls => rows.some(r => r.class === cls));
  for (const route of [...routes].sort()) {
    for (const cls of swept) {
      if (!flagged.has(`${route}|${cls}`))
        labels.push({
          route,
          class: cls,
          truth: 'clean',
          source: `${source}#implicit`,
          evidence: 'Swept by a human critic; class not flagged.',
          labeledAt,
        });
    }
  }
  return labels.sort(
    (a, b) => a.route.localeCompare(b.route) || a.class.localeCompare(b.class)
  );
}

/** Latest run per (source, route): the set of detectors that fired. */
export function latestObservations(rows) {
  const runs = new Map();
  for (const row of rows) {
    if (row.kind !== 'route-run' || row.status !== 'ok') continue;
    const key = `${row.source}|${row.route}`;
    const prev = runs.get(key);
    if (!prev || prev.at < row.at)
      runs.set(key, {
        at: row.at,
        runId: row.runId,
        source: row.source,
        route: row.route,
        fired: new Set(),
      });
  }
  for (const row of rows) {
    if (row.kind !== 'finding') continue;
    const run = runs.get(`${row.source}|${row.route}`);
    if (run && run.runId === row.runId) run.fired.add(row.detector);
  }
  return [...runs.values()];
}

export function measure(observationRows, labels) {
  const runs = latestObservations(observationRows);
  const truth = new Map();
  for (const l of labels) truth.set(`${l.route}|${l.class}`, l.truth); // later labels win
  const detectors = {};
  const classes = {};
  const blank = () => ({ tp: 0, fp: 0, fn: 0, tn: 0 });
  for (const [detector, cls] of Object.entries(DETECTOR_CLASSES)) {
    const m = blank();
    const c = (classes[cls] ??= blank());
    const seen = new Set();
    for (const run of runs) {
      const t = truth.get(`${run.route}|${cls}`);
      if (!t) continue;
      const fired = run.fired.has(detector);
      const defect = t === 'defect';
      if (fired && defect) m.tp += 1;
      else if (fired) m.fp += 1;
      else if (defect) m.fn += 1;
      else m.tn += 1;
      const ck = `${run.source}|${run.route}`;
      if (!c.counted?.has(ck)) {
        const anyFired = Object.entries(DETECTOR_CLASSES).some(
          ([d, k]) => k === cls && run.fired.has(d)
        );
        if (anyFired && defect) c.tp += 1;
        else if (anyFired) c.fp += 1;
        else if (defect) c.fn += 1;
        else c.tn += 1;
        (c.counted ??= new Set()).add(ck);
      }
      seen.add(ck);
    }
    detectors[detector] = finalize({ ...m, class: cls });
  }
  for (const [cls, c] of Object.entries(classes)) {
    delete c.counted;
    classes[cls] = finalize(c);
  }
  return { detectors, classes };
}

function finalize(m) {
  return {
    ...m,
    positives: m.tp + m.fn,
    negatives: m.fp + m.tn,
    precision: m.tp + m.fp ? m.tp / (m.tp + m.fp) : null,
    recall: m.tp + m.fn ? m.tp / (m.tp + m.fn) : null,
    precisionLower95: m.tp + m.fp ? wilsonLower(m.tp, m.tp + m.fp) : 0,
  };
}

/** Distinct UTC days with a completed PR run. */
export function prRunDays(observationRows) {
  return new Set(
    observationRows
      .filter(
        r => r.kind === 'route-run' && r.source === 'pr' && r.status === 'ok'
      )
      .map(r => r.at.slice(0, 10))
  ).size;
}

export function verdict(detectorMetrics, classMetrics, days, config) {
  const floors = config.hamelFloors;
  const min = config.minimums;
  const why = [];
  if (classMetrics.positives < min.positives)
    why.push(`${classMetrics.positives}/${min.positives} labeled defects`);
  if (classMetrics.negatives < min.negatives)
    why.push(`${classMetrics.negatives}/${min.negatives} labeled clean routes`);
  if (
    detectorMetrics.precision === null ||
    detectorMetrics.precision < floors.precisionMin
  )
    why.push(
      `precision ${fmt(detectorMetrics.precision)} < ${floors.precisionMin}`
    );
  else if (detectorMetrics.precisionLower95 < floors.precisionMin)
    why.push(
      `precision 95% lower bound ${fmt(detectorMetrics.precisionLower95)} < ${floors.precisionMin}`
    );
  if (classMetrics.recall === null || classMetrics.recall < floors.recallMin)
    why.push(`class recall ${fmt(classMetrics.recall)} < ${floors.recallMin}`);
  if (days < min.prRunDays)
    why.push(`${days}/${min.prRunDays} days of PR runs`);
  return { mayBlock: why.length === 0, why };
}

const fmt = v => (v === null || v === undefined ? 'n/a' : v.toFixed(2));

export function calibrate({ observations, labels, config }) {
  const { detectors, classes } = measure(observations, labels);
  const days = prRunDays(observations);
  const out = {};
  for (const [id, m] of Object.entries(detectors))
    out[id] = {
      ...m,
      ...verdict(m, classes[m.class], days, config),
      mode: config.detectorModes?.[id] ?? 'shadow',
    };
  return { detectors: out, classes, prRunDays: days };
}

/** A detector set to blocking must meet the floors; promotion is derived, never hand-set. */
export function checkPromotion(result, config) {
  const failures = [];
  for (const [id, d] of Object.entries(result.detectors)) {
    if (d.mode === 'blocking' && !d.mayBlock)
      failures.push(
        `${id} is blocking but fails the floors: ${d.why.join('; ')}`
      );
  }
  if (
    config.promoteToBlocking &&
    !Object.values(result.detectors).some(d => d.mode === 'blocking')
  )
    failures.push(
      'promoteToBlocking is true but no detector is set to blocking'
    );
  return failures;
}

export function table(result) {
  const lines = [
    'detector               class              tp  fp  fn  tn  precision (95% low)  recall(class)  verdict',
  ];
  for (const [id, d] of Object.entries(result.detectors)) {
    const c = result.classes[d.class];
    lines.push(
      `${id.padEnd(22)} ${d.class.padEnd(18)} ${String(d.tp).padStart(3)} ${String(d.fp).padStart(3)} ${String(d.fn).padStart(3)} ${String(d.tn).padStart(3)}  ${fmt(d.precision).padStart(4)} (${fmt(d.precisionLower95)})          ${fmt(c.recall).padStart(4)}          ${d.mode}; ${d.mayBlock ? 'meets floors' : `held: ${d.why[0]}`}`
    );
  }
  lines.push(`PR-run days observed: ${result.prRunDays}`);
  return lines.join('\n');
}

function main(argv) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const [cmd, ...rest] = argv;
  if (cmd === 'import-sweep') {
    const rubric = JSON.parse(readFileSync(RUBRIC_PATH, 'utf8'));
    const classes = [...new Set(rubric.detectors.map(d => d.class))];
    const rows = rest.flatMap(p => readJsonl(p));
    const labels = importSweep(rows, {
      classes,
      source: 'critic-sweep-2026-10-29',
      labeledAt: '2026-10-29',
    });
    writeFileSync(
      LABELS_PATH,
      labels.map(l => JSON.stringify(l)).join('\n') + '\n'
    );
    process.stdout.write(
      `${labels.filter(l => l.truth === 'defect').length} defect and ${labels.filter(l => l.truth === 'clean').length} clean labels from ${rows.length} sweep rows\n`
    );
    return 0;
  }
  if (cmd === 'label') {
    const [route, cls, truth, source, ...evidence] = rest;
    if (
      !route ||
      !Object.values(DETECTOR_CLASSES).includes(cls) ||
      !['defect', 'clean'].includes(truth) ||
      !source ||
      evidence.length === 0
    ) {
      process.stderr.write(
        'usage: label <route> <class> <defect|clean> <source> <evidence...>\n'
      );
      return 2;
    }
    appendFileSync(
      LABELS_PATH,
      JSON.stringify({
        route: normalizeRoute(route),
        class: cls,
        truth,
        source,
        evidence: evidence.join(' '),
        labeledAt: new Date().toISOString().slice(0, 10),
      }) + '\n'
    );
    return 0;
  }
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const obsIdx = argv.indexOf('--observations');
  const extra = obsIdx >= 0 ? argv[obsIdx + 1].split(',') : [];
  const observations = [OBSERVATIONS_PATH, ...extra].flatMap(readJsonl);
  const result = calibrate({
    observations,
    labels: readJsonl(LABELS_PATH),
    config,
  });
  if (flags.has('--json'))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${table(result)}\n`);
  if (flags.has('--check')) {
    const failures = checkPromotion(result, config);
    for (const f of failures)
      process.stderr.write(`marketing-critic promotion: ${f}\n`);
    return failures.length ? 1 : 0;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
