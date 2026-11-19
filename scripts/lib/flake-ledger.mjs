/**
 * Event-driven flake ledger and rerun policy, keyed on (head, base) — JOV-13105.
 *
 * Verified flip (v1): attempt 1 of a run concluded failure or timed_out and
 * a later attempt of the SAME run concluded success, with the actually
 * fetched base recorded. A flip after main moved is never a test flake;
 * runs without a base SHA are never recorded. Bulk reruns (one actor re-runs
 * 5+ runs within 10 minutes) go on a separate line and are never flakes;
 * evidence-gate flips (PR Ready / fleet-rule evidence) are counted
 * separately from test flips and never quarantined. Rates publish with n
 * and a Wilson 95% interval.
 *
 * Repeat offenders (2+ verified TEST flips on one test in the rolling
 * window) feed the EXISTING quarantine list via
 * scripts/propose-flip-quarantine.mjs — never a second list. Bounded-retry
 * policy: infrastructure classes only, never test assertions, never
 * unclassified, at most MAX_RETRIES_PER_WINDOW per (head, base, workflow)
 * window. Pure library plus a small CLI.
 */ import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
export const LEDGER_SCHEMA = 'jovie-flake-ledger/v1';
export const FLIP_WINDOW_MS = 7 * DAY;
export const RETRY_WINDOW_MS = DAY;
export const MAX_RETRIES_PER_WINDOW = 1;
export const MIN_FLIPS_FOR_QUARANTINE = 2;
export const BULK_WINDOW_MS = 10 * 60000;
export const BULK_MIN_RUNS = 5;
const SHA = /^[a-f0-9]{40}$/;
const CONCLUSIONS = new Set(['success', 'failure', 'timed_out', 'cancelled']);
const FLIPPABLE = new Set(['failure', 'timed_out']);
const SUBJECT = /^[\w ./()@][\w ./()@:-]{0,198}$/;
const EVIDENCE_GATE = /PR Ready|fleet-rule evidence|Fleet Rules Evidence/i;

function fact(ok, message) {
  if (!ok) throw new Error(message);
}

/** A completed-run record: workflow path (.yml/.yaml), run identity, the
 *  (head, base) key with the base actually fetched, terminal conclusion,
 *  attempt-1 failed subjects. `testFile` is optional junit enrichment;
 *  `actor` + `rerunAt` power bulk-rerun detection. */
export function normalizeRun(record) {
  fact(record !== null && typeof record === 'object', 'Run record required');
  fact(
    typeof record.workflowPath === 'string' &&
      /^\.github\/workflows\/[\w./-]+\.ya?ml$/.test(record.workflowPath),
    'Untrusted workflow path'
  );
  fact(
    Number.isSafeInteger(record.runId) &&
      record.runId > 0 &&
      Number.isSafeInteger(record.runAttempt) &&
      record.runAttempt > 0,
    'Invalid run identity'
  );
  fact(SHA.test(record.headSha), 'Invalid head SHA');
  fact(record.baseSha === null || SHA.test(record.baseSha), 'Invalid base SHA');
  fact(CONCLUSIONS.has(record.conclusion), 'Unsupported run conclusion');
  const at = Date.parse(record.observedAt ?? '');
  fact(Number.isFinite(at), 'Invalid observation time');
  fact(
    (record.failedSubjects ?? []).every(
      subject => typeof subject === 'string' && SUBJECT.test(subject)
    ),
    'Unsafe failed subject'
  );
  const listed = [...new Set(record.failedSubjects ?? [])].sort();
  // A run without explicit subjects registers at the workflow level, so
  // workflow-level flips stay detectable from run metadata alone.
  const subjects =
    listed.length > 0
      ? listed
      : [`workflow:${record.workflowPath}`.slice(0, 200)];
  const testFile = record.testFile ? String(record.testFile) : null;
  const actor =
    typeof record.actor === 'string' && record.actor.trim()
      ? record.actor.trim().slice(0, 100)
      : null;
  const rerunAtMs = Date.parse(record.rerunAt ?? record.observedAt);
  return {
    ...record,
    subjects,
    testFile,
    actor,
    rerunAt: Number.isFinite(rerunAtMs)
      ? new Date(rerunAtMs).toISOString()
      : at,
    observedAt: new Date(at).toISOString(),
  };
}

function flipKind(subjects) {
  // Any failed subject outside the evidence gates makes this a TEST flip;
  // gate-only failures are counted separately and never quarantined.
  return subjects.every(subject => EVIDENCE_GATE.test(subject))
    ? 'evidence-gate'
    : 'test';
}

export function wilson95(k, n, z = 1.96) {
  if (!(Number.isSafeInteger(n) && n > 0) || k < 0 || k > n) return null;
  const p = k / n;
  const z2 = z * z;
  const d = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / d;
  const spread = (z / d) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, center - spread), hi: Math.min(1, center + spread) };
}

/** Drops events older than the window; bounds the ledger size.
 *  @param {{ now?: number }} [options]
 */
export function pruneLedger(ledger, options = {}) {
  const now = options.now ?? Date.now();
  const floor = now - FLIP_WINDOW_MS;
  const inWindow = event => Date.parse(event.at) >= floor;
  return {
    ...ledger,
    failures: ledger.failures.filter(inWindow).slice(-4000),
    flips: ledger.flips.filter(inWindow).slice(-2000),
    bulk: (ledger.bulk ?? []).filter(inWindow).slice(-2000),
    rerunEvents: (ledger.rerunEvents ?? []).filter(inWindow).slice(-4000),
    runs: (ledger.runs ?? []).filter(inWindow).slice(-4000),
    retries: ledger.retries.filter(inWindow).slice(-200),
  };
}

const ROW_RULES = {
  failures: row =>
    SHA.test(row.headSha) &&
    (row.baseSha === null || SHA.test(row.baseSha)) &&
    Number.isSafeInteger(row.runId) &&
    typeof row.subject === 'string' &&
    Number.isFinite(Date.parse(row.at)),
  flips: row =>
    SHA.test(row.headSha) &&
    SHA.test(row.baseSha) &&
    typeof row.subject === 'string' &&
    Array.isArray(row.failedRunIds) &&
    Number.isFinite(Date.parse(row.at)),
  bulk: row =>
    SHA.test(row.headSha) &&
    SHA.test(row.baseSha) &&
    Number.isFinite(Date.parse(row.at)),
  rerunEvents: row =>
    Number.isSafeInteger(row.runId) && Number.isFinite(Date.parse(row.at)),
  runs: row =>
    Number.isSafeInteger(row.runId) && Number.isFinite(Date.parse(row.at)),
  retries: row =>
    SHA.test(row.headSha) &&
    SHA.test(row.baseSha) &&
    Number.isFinite(Date.parse(row.at)),
};

/** Validates and prunes an externally loaded ledger; foreign ledgers are
 *  replaced, never merged. Missing optional lines start empty. */
export function loadLedger(raw, { now = Date.now() } = {}) {
  fact(
    raw === null ||
      raw === undefined ||
      (typeof raw === 'object' && !Array.isArray(raw)),
    'Malformed flake ledger'
  );
  const ledger =
    raw === null || raw === undefined
      ? { schemaVersion: LEDGER_SCHEMA }
      : { ...raw };
  if (
    ledger.schemaVersion !== LEDGER_SCHEMA ||
    !Array.isArray(ledger.failures) ||
    !Array.isArray(ledger.flips) ||
    !Array.isArray(ledger.retries)
  )
    return pruneLedger(
      { schemaVersion: LEDGER_SCHEMA, failures: [], flips: [], retries: [] },
      { now }
    );
  for (const key of ['bulk', 'rerunEvents', 'runs'])
    if (!Array.isArray(ledger[key])) ledger[key] = [];
  for (const [kind, valid] of Object.entries(ROW_RULES))
    for (const row of ledger[kind])
      fact(valid(row), `Malformed flake ledger ${kind} row`);
  return pruneLedger(ledger, { now });
}

/** Records one completed run: a verified flip (v1) is written when a
 *  success on a later attempt lands for a run whose attempt 1 failed or
 *  timed out, keyed on (head, base). Bulk-rerun runs land on the separate
 *  `bulk` line — never as flakes. Baseless runs are never recorded. */
export function recordRun(ledgerInput, runInput, { now = Date.now() } = {}) {
  const run = normalizeRun(runInput);
  const ledger = loadLedger(ledgerInput, { now });
  if (run.baseSha === null) return { ledger, flips: [] };
  const at = run.observedAt;
  const failures = [...ledger.failures];
  const flips = [...ledger.flips];
  const bulk = [...ledger.bulk];
  const rerunEvents = [...ledger.rerunEvents];
  const runs = [...ledger.runs, { runId: run.runId, at }];
  // Bulk detection: an actor re-running BULK_MIN_RUNS+ runs inside the
  // trailing 10-minute window marks every run in that window bulk,
  // retroactively pulling any flips they produced off the flake line.
  const bulkRunIds = new Set();
  if (run.runAttempt > 1) {
    rerunEvents.push({ runId: run.runId, actor: run.actor, at: run.rerunAt });
    const windowStart = Date.parse(run.rerunAt) - BULK_WINDOW_MS;
    const byActor = new Map();
    for (const event of rerunEvents) {
      if (Date.parse(event.at) < windowStart) continue;
      const list = byActor.get(event.actor) ?? [];
      list.push(event.runId);
      byActor.set(event.actor, list);
    }
    for (const list of byActor.values())
      if (list.length >= BULK_MIN_RUNS)
        for (const runId of list) bulkRunIds.add(runId);
    // Retroactively pull any flips bulk runs produced off the flake line.
    const stay = [];
    for (const row of flips)
      bulkRunIds.has(row.runId)
        ? bulk.push({ ...row, bulk: true })
        : stay.push(row);
    flips.length = 0;
    flips.push(...stay);
  }
  let recorded = null;
  if (FLIPPABLE.has(run.conclusion)) {
    for (const subject of run.subjects)
      failures.push({
        headSha: run.headSha,
        baseSha: run.baseSha,
        subject,
        workflowPath: run.workflowPath,
        runId: run.runId,
        runAttempt: run.runAttempt,
        conclusion: run.conclusion,
        testFile: run.testFile,
        kind: flipKind(run.subjects),
        at,
      });
  } else if (run.conclusion === 'success' && run.runAttempt > 1) {
    // Verified flip (v1): attempt 1 of this same run failed or timed out.
    const prior = failures.filter(
      row =>
        row.runId === run.runId &&
        row.baseSha === run.baseSha &&
        row.runAttempt === 1 &&
        FLIPPABLE.has(row.conclusion)
    );
    const priorSubjects = new Set(prior.map(row => row.subject));
    const flipped = new Set(
      flips.filter(row => row.runId === run.runId).map(row => row.subject)
    );
    for (const subject of run.subjects) {
      if (!priorSubjects.has(subject) || flipped.has(subject)) continue;
      const row = prior.find(item => item.subject === subject);
      recorded = {
        headSha: run.headSha,
        baseSha: run.baseSha,
        subject,
        runId: run.runId,
        kind: row.kind,
        workflowPath: run.workflowPath,
        failedRunIds: [run.runId],
        testFile: row.testFile,
        at,
      };
      if (bulkRunIds.has(run.runId)) bulk.push({ ...recorded, bulk: true });
      else flips.push(recorded);
    }
  }
  const next = pruneLedger(
    { ...ledger, failures, flips, bulk, rerunEvents, runs },
    { now: Date.parse(at) + 1 }
  );
  return {
    ledger: next,
    flips: recorded && !bulkRunIds.has(run.runId) ? [recorded] : [],
  };
}

/** Tests with 2+ verified TEST flips in the rolling window (gate flips and
 *  bulk reruns never qualify), keyed on test file when junit enrichment
 *  exists, else on the subject. */
export function repeatOffenders(ledger, { now = Date.now() } = {}) {
  const floor = now - FLIP_WINDOW_MS;
  const byTest = new Map();
  for (const row of ledger.flips) {
    if (Date.parse(row.at) < floor || (row.kind ?? 'test') !== 'test') continue;
    const key = row.testFile ?? row.subject;
    const list = byTest.get(key) ?? [];
    list.push(row);
    byTest.set(key, list);
  }
  const offenders = [];
  for (const [test, rows] of byTest) {
    if (rows.length < MIN_FLIPS_FOR_QUARANTINE) continue;
    const ats = rows.map(row => row.at).sort();
    offenders.push({
      test,
      subject: rows[0].subject,
      workflowPath: rows[0].workflowPath,
      flips: rows.length,
      heads: [...new Set(rows.map(row => row.headSha))],
      firstAt: ats[0],
      lastAt: ats.at(-1),
      testFiles: rows[0].testFile ? [rows[0].testFile] : [],
      failedRunIds: [...new Set(rows.flatMap(row => row.failedRunIds))].sort(
        (a, b) => a - b
      ),
    });
  }
  return offenders.sort(
    (a, b) => b.flips - a.flips || String(a.test).localeCompare(String(b.test))
  );
}

/** Measured rate over the window: verified flips / completed runs, always
 *  with n and Wilson 95% intervals; gate flips and bulk reruns on their own
 *  lines. Lower bound on flakiness, upper bound on test flakes. */
export function reportMetrics(ledger, { now = Date.now() } = {}) {
  const fresh = loadLedger(ledger, { now });
  const n = fresh.runs.length;
  const flips = fresh.flips;
  const test = flips.filter(row => (row.kind ?? 'test') === 'test').length;
  return {
    n,
    verifiedFlips: flips.length,
    testFlips: test,
    evidenceGateFlips: flips.length - test,
    bulkRerunRuns: fresh.bulk.length,
    flipRate: n ? flips.length / n : null,
    flipCi95: wilson95(flips.length, n),
    testFlipRate: n ? test / n : null,
    testFlipCi95: wilson95(test, n),
  };
}

/**
 * Bounded-retry rate limit: at most MAX_RETRIES_PER_WINDOW retries per
 * (head, base, workflow) inside the window.
 */
export function canRetry(ledger, key, { now = Date.now() } = {}) {
  const floor = now - RETRY_WINDOW_MS;
  const used = ledger.retries.filter(
    row =>
      row.headSha === key.headSha &&
      row.baseSha === key.baseSha &&
      row.workflowPath === key.workflowPath &&
      Date.parse(row.at) >= floor
  ).length;
  return {
    allowed: used < MAX_RETRIES_PER_WINDOW,
    used,
    max: MAX_RETRIES_PER_WINDOW,
  };
}

export function recordRetry(ledgerInput, key, { now = Date.now() } = {}) {
  const ledger = loadLedger(ledgerInput, { now });
  fact(SHA.test(key.headSha) && SHA.test(key.baseSha), 'Invalid retry key');
  fact(canRetry(ledger, key, { now }).allowed, 'Retry rate limit exceeded');
  return {
    ledger: pruneLedger(
      {
        ...ledger,
        retries: [
          ...ledger.retries,
          { ...key, at: new Date(now).toISOString() },
        ],
      },
      { now: now + 1 }
    ),
  };
}

const verdict = (retryable, kind, reason) => ({ retryable, kind, reason });

/** One-bounded-retry classifier: infrastructure classes only, never test
 *  assertions (they win over infra words in the same evidence), never
 *  unclassified.
 *  @param {{ conclusion?: string, failedSteps?: string[], annotationText?: string }} [failure] */
export function classifyRerunEligibility({
  conclusion,
  failedSteps = [],
  annotationText = '',
} = {}) {
  if (conclusion !== 'failure')
    return verdict(
      false,
      'unclassified',
      `non-failure conclusion ${JSON.stringify(conclusion ?? null)}`
    );
  const evidence = [
    annotationText,
    ...failedSteps.filter(step => typeof step === 'string'),
  ].join('\n');
  const assertion = ASSERTION_PATTERNS.find(pattern => pattern.test(evidence));
  if (assertion)
    return verdict(
      false,
      'test-assertion',
      `assertion evidence ${String(assertion)}`
    );
  const infra = INFRA_PATTERNS.find(({ pattern }) => pattern.test(evidence));
  if (infra)
    return verdict(
      true,
      'transient-infrastructure',
      `infra class ${infra.kind}`
    );
  return verdict(
    false,
    'unclassified',
    'no recognized infrastructure signature'
  );
}

/** Assertion/verdict signatures: a rerun can never fix these. */
const ASSERTION_PATTERNS = [
  /\bAssertionError\b/,
  /\bexpect\(/,
  /\berror TS\d{4}\b/,
  /\beslint\b/i,
  /\bpytest\b/i,
  /\bvitest\b/i,
  /\bjest\b/i,
  /\b\d+ (?:tests?|specs?) (?:failed|failing)\b/i,
  /\bFAIL\b.*\btest\b/i,
  /::error file=/,
];

/** Infrastructure-only signatures: the only rerunnable classes. */
const INFRA_PATTERNS = [
  {
    kind: 'network',
    pattern:
      /could not resolve host|connection (?:refused|reset|timed out)|network (?:error|unreachable)|fetch failed|ECONN(?:REFUSED|RESET)|ETIMEDOUT|The requested URL returned error/i,
  },
  {
    kind: 'checkout',
    pattern:
      /\bactions\/checkout\b.*fail|fatal: (?:unable to access|could not read)|remote: Internal server error|git fetch.*fail/i,
  },
  {
    kind: 'http',
    pattern:
      /\b429\b|\b502\b|\b503\b|\b504\b|rate limit|Bad Gateway|Service Unavailable|Internal Server Error/i,
  },
  {
    kind: 'runner-lost',
    pattern:
      /lost communication with the runner|The runner has received a shutdown signal|exit code 143\b|SIGTERM/i,
  },
];

/** CLI for the `workflow_run: completed` hook (pure file ops; the workflow
 *  owns API reads): record --ledger P --run-file F | report --ledger P */
export function main(argv = process.argv.slice(2)) {
  const flag = name => {
    const index = argv.indexOf(name);
    if (index === -1 || index + 1 >= argv.length)
      throw new Error(`Missing ${name} <path>`);
    return argv[index + 1];
  };
  const mode = argv[0];
  const ledgerPath = flag('--ledger');
  const current = readFileSync(ledgerPath, 'utf8');
  const now = Date.now();
  if (mode === 'record') {
    const run = JSON.parse(readFileSync(flag('--run-file'), 'utf8'));
    const result = recordRun(JSON.parse(current), run, { now });
    if (JSON.stringify(result.ledger) !== JSON.stringify(JSON.parse(current)))
      writeFileSync(ledgerPath, `${JSON.stringify(result.ledger, null, 2)}\n`);
    return { mode, recordedFlips: result.flips.length };
  }
  if (mode === 'report')
    return {
      mode,
      metrics: reportMetrics(JSON.parse(current), { now }),
      offenders: repeatOffenders(JSON.parse(current), { now }),
    };
  throw new Error(`Unsupported mode ${JSON.stringify(mode)}`);
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    console.log(JSON.stringify(main()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
