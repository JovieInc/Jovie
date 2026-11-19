/**
 * Event-driven flake ledger and rerun policy, keyed on (head, base) — JOV-13105.
 *
 * A flip is a workflow run that went red→green on the SAME head SHA with no
 * new commit, against the SAME base SHA: a flip after main moved is a
 * different (head, base) pair and is never evidence of flakiness. A future
 * `workflow_run: completed` job calls the CLI `record` mode; repeat offenders
 * (2+ flips for one subject in the rolling window) feed the EXISTING
 * quarantine list via scripts/propose-flip-quarantine.mjs — never a second
 * list. Pure library plus a small CLI; no network access.
 *
 * Bounded-retry policy: a rerun is allowed ONLY for infrastructure classes
 * (checkout/network, 429/5xx, lost runner), never for test assertions,
 * never for unclassified evidence, at most MAX_RETRIES_PER_WINDOW per
 * (head, base, workflow) window. The retry hook belongs to the workflow
 * owner; this is its pure gate.
 */ import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
export const LEDGER_SCHEMA = 'jovie-flake-ledger/v1';
export const FLIP_WINDOW_MS = 7 * DAY;
export const RETRY_WINDOW_MS = DAY;
export const MAX_RETRIES_PER_WINDOW = 1;
export const MIN_FLIPS_FOR_QUARANTINE = 2;
const SHA = /^[a-f0-9]{40}$/;
const CONCLUSIONS = new Set(['success', 'failure', 'timed_out', 'cancelled']);
const SUBJECT = /^[\w ./()@][\w ./()@:-]{0,198}$/;

function fact(ok, message) {
  if (!ok) throw new Error(message);
}

/** A completed-run record: workflow path, run identity, (head, base) key,
 *  terminal conclusion, failed subjects. `testFile` is optional junit
 *  enrichment that makes a subject quarantine-eligible later. */
export function normalizeRun(record) {
  fact(record !== null && typeof record === 'object', 'Run record required');
  fact(
    typeof record.workflowPath === 'string' &&
      record.workflowPath.startsWith('.github/workflows/') &&
      record.workflowPath.endsWith('.yml'),
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
  for (const subject of record.failedSubjects ?? [])
    fact(
      typeof subject === 'string' && SUBJECT.test(subject),
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
  return {
    ...record,
    subjects,
    observedAt: new Date(at).toISOString(),
    testFile,
  };
}

/** Drops events older than the window; bounds the ledger size. */
export function pruneLedger(ledger, { now } = {}) {
  const floor = now - FLIP_WINDOW_MS;
  const inWindow = event => Date.parse(event.at) >= floor;
  return {
    ...ledger,
    failures: ledger.failures.filter(inWindow).slice(-4000),
    flips: ledger.flips.filter(inWindow).slice(-2000),
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
  retries: row =>
    SHA.test(row.headSha) &&
    SHA.test(row.baseSha) &&
    Number.isFinite(Date.parse(row.at)),
};

/** Validates and prunes an externally loaded ledger; foreign ledgers are
 *  replaced, never merged. */
export function loadLedger(raw, { now = Date.now() } = {}) {
  fact(
    raw === null ||
      raw === undefined ||
      (typeof raw === 'object' && !Array.isArray(raw)),
    'Malformed flake ledger'
  );
  if (
    raw === null ||
    raw === undefined ||
    raw.schemaVersion !== LEDGER_SCHEMA ||
    !Array.isArray(raw.failures) ||
    !Array.isArray(raw.flips) ||
    !Array.isArray(raw.retries)
  )
    return {
      schemaVersion: LEDGER_SCHEMA,
      failures: [],
      flips: [],
      retries: [],
    };
  for (const [kind, valid] of Object.entries(ROW_RULES))
    for (const row of raw[kind])
      fact(valid(row), `Malformed flake ledger ${kind} row`);
  return pruneLedger(raw, { now });
}

/** Records one completed run: a flip is written when a success lands for a
 *  (head, base, subject) a prior failure covered. Runs without a base SHA
 *  are never recorded — an unkeyed flip cannot prove the base held still. */
export function recordRun(ledgerInput, runInput, { now = Date.now() } = {}) {
  const run = normalizeRun(runInput);
  const ledger = loadLedger(ledgerInput, { now });
  if (run.baseSha === null) return { ledger, flips: [] };
  const key = row => `${row.headSha}:${row.baseSha}:${row.subject}`;
  const at = run.observedAt;
  const failures = [...ledger.failures];
  const flips = [...ledger.flips];
  if (run.conclusion === 'failure') {
    for (const subject of run.subjects)
      failures.push({
        headSha: run.headSha,
        baseSha: run.baseSha,
        subject,
        workflowPath: run.workflowPath,
        runId: run.runId,
        runAttempt: run.runAttempt,
        testFile: run.testFile,
        at,
      });
  } else if (run.conclusion === 'success') {
    const prior = new Map();
    for (const row of failures) {
      const id = key(row);
      if (!prior.has(id)) prior.set(id, []);
      prior.get(id).push(row);
    }
    const flipped = new Set(flips.map(key));
    for (const subject of run.subjects) {
      const id = `${run.headSha}:${run.baseSha}:${subject}`;
      if (flipped.has(id) || !prior.has(id)) continue;
      flips.push({
        headSha: run.headSha,
        baseSha: run.baseSha,
        subject,
        workflowPath: run.workflowPath,
        failedRunIds: [...new Set(prior.get(id).map(row => row.runId))].sort(
          (a, b) => a - b
        ),
        testFile: prior.get(id).find(row => row.testFile)?.testFile ?? null,
        at,
      });
    }
  }
  const next = pruneLedger(
    { ...ledger, failures, flips },
    { now: Date.parse(at) + 1 }
  );
  return {
    ledger: next,
    flips: flips.filter(row => !ledger.flips.includes(row)),
  };
}

/** Subjects with MIN_FLIPS_FOR_QUARANTINE or more same-(head, base) flips
 *  in the rolling window. */
export function repeatOffenders(ledger, { now = Date.now() } = {}) {
  const floor = now - FLIP_WINDOW_MS;
  const bySubject = new Map();
  for (const row of ledger.flips) {
    if (Date.parse(row.at) < floor) continue;
    const list = bySubject.get(row.subject) ?? [];
    list.push(row);
    bySubject.set(row.subject, list);
  }
  const offenders = [];
  for (const [subject, rows] of bySubject) {
    if (rows.length < MIN_FLIPS_FOR_QUARANTINE) continue;
    const ats = rows.map(row => row.at).sort();
    offenders.push({
      subject,
      workflowPath: rows[0].workflowPath,
      flips: rows.length,
      heads: [...new Set(rows.map(row => row.headSha))],
      firstAt: ats[0],
      lastAt: ats.at(-1),
      testFiles: [...new Set(rows.map(row => row.testFile).filter(Boolean))],
      failedRunIds: [...new Set(rows.flatMap(row => row.failedRunIds))].sort(
        (a, b) => a - b
      ),
    });
  }
  return offenders.sort(
    (a, b) => b.flips - a.flips || a.subject.localeCompare(b.subject)
  );
}

/** Bounded-retry rate limit: at most MAX_RETRIES_PER_WINDOW retries per
 *  (head, base, workflow) inside the window. */
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

/**
 * One-bounded-retry classifier for CI reruns. Test assertions win over
 * infrastructure words in the same evidence: a run that shows a real
 * assertion is never rerun to green. Unclassified evidence fails closed.
 */
const verdict = (retryable, kind, reason) => ({ retryable, kind, reason });

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

/** CLI for the future `workflow_run: completed` hook (pure file ops; the
 *  workflow owns any API reads):
 *    node scripts/lib/flake-ledger.mjs record --ledger P --run-file F
 *    node scripts/lib/flake-ledger.mjs report --ledger P */
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
    return { mode, offenders: repeatOffenders(JSON.parse(current), { now }) };
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
