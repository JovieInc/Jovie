#!/usr/bin/env node
// Absence, age and polling never certify an execution. The trusted artifact
// collector must bind execution evidence to this exact checkout before writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const DAY = 86400000;
const REPOSITORY = 'JovieInc/Jovie';
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const positive = x => Number.isSafeInteger(x) && x > 0;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const LINEAR =
  /^https:\/\/linear\.app\/jovie\/issue\/JOV-\d+(?:\/[a-z0-9-]+)?$/;
function requireFact(ok, message) {
  if (!ok) throw new Error(message);
}
function mapToLedgerPath(file) {
  if (
    !text(file) ||
    file.includes('\\') ||
    file.split('/').some(x => !x || x === '.' || x === '..')
  )
    return null;
  const rel = file.startsWith('apps/web/') ? file.slice(9) : file;
  if (!/^tests\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/.test(rel)) return null;
  return rel.startsWith('tests/e2e/')
    ? { kind: 'e2e', path: `apps/web/${rel}` }
    : { kind: 'unit', path: rel };
}
function entryFile(entry) {
  return entry.kind === 'unit' ? `apps/web/${entry.path}` : entry.path;
}
function validateLedger(ledger) {
  requireFact(
    record(ledger) &&
      ledger.schemaVersion === 1 &&
      record(ledger.retryBudget) &&
      Array.isArray(ledger.entries),
    'Malformed quarantine ledger'
  );
  for (const key of [
    'unitDefaultRetries',
    'quarantineUnitRetries',
    'e2eDefaultRetries',
    'quarantineE2eRetries',
    'maxRetryAttemptsPerCiRun',
    'unitShardCount',
  ]) {
    requireFact(
      Number.isSafeInteger(ledger.retryBudget[key]) &&
        ledger.retryBudget[key] >=
          (key === 'unitShardCount' || key === 'maxRetryAttemptsPerCiRun'
            ? 1
            : 0),
      'Malformed retry budget'
    );
  }
  const ids = new Set();
  const paths = new Set();
  for (const e of ledger.entries) {
    requireFact(record(e), 'Malformed quarantine entry');
    const mapped = mapToLedgerPath(entryFile(e));
    requireFact(
      mapped && mapped.path === e.path && mapped.kind === e.kind,
      'Unsafe quarantine path'
    );
    for (const key of [
      'id',
      'owner',
      'firstSeenAt',
      'reproductionCommand',
      'fixIssueUrl',
      'expiresAt',
    ])
      requireFact(text(e[key]), `Missing ${key}`);
    requireFact(
      LINEAR.test(e.fixIssueUrl) &&
        Number.isFinite(Date.parse(e.firstSeenAt)) &&
        Number.isFinite(Date.parse(e.expiresAt)),
      'Invalid quarantine metadata'
    );
    requireFact(
      !ids.has(e.id) && !paths.has(e.path),
      'Duplicate quarantine entry'
    );
    ids.add(e.id);
    paths.add(e.path);
  }
}
function validateReport(report, options) {
  requireFact(
    record(report) &&
      report.schemaVersion === 1 &&
      report.repository === REPOSITORY &&
      report.headSha === options.headSha &&
      SHA.test(options.headSha),
    'Foreign or unbound quarantine report'
  );
  const generated = Date.parse(report.generatedAt);
  requireFact(
    Number.isFinite(generated) &&
      generated <= options.now &&
      generated >= options.now - DAY,
    'Stale quarantine report'
  );
  requireFact(
    report.complete === true &&
      Array.isArray(report.observations) &&
      report.observations.length <= 100000,
    'Incomplete quarantine report'
  );
  const seen = new Set();
  for (const row of report.observations) {
    requireFact(
      record(row) &&
        mapToLedgerPath(row.file) &&
        HASH.test(row.fileHash) &&
        SHA.test(row.headSha),
      'Malformed execution identity'
    );
    requireFact(
      positive(row.runId) &&
        positive(row.runAttempt) &&
        ['push', 'merge_group', 'pull_request'].includes(row.event),
      'Malformed run binding'
    );
    requireFact(
      row.repository === REPOSITORY &&
        row.artifactVerified === true &&
        positive(row.artifactId),
      'Unverified execution artifact'
    );
    requireFact(
      positive(row.executedCount) &&
        row.skippedCount === 0 &&
        Number.isSafeInteger(row.retryCount) &&
        row.retryCount >= 0,
      'Incomplete test execution'
    );
    requireFact(
      ['clean', 'flaky', 'failed'].includes(row.outcome) &&
        (row.outcome !== 'clean' || row.retryCount === 0) &&
        (row.outcome !== 'flaky' || row.retryCount > 0),
      'Ambiguous test outcome'
    );
    requireFact(
      Number.isFinite(Date.parse(row.runAt)) &&
        Date.parse(row.runAt) <= generated,
      'Invalid execution time'
    );
    const key = `${row.runId}:${row.runAttempt}:${entryFile(mapToLedgerPath(row.file))}`;
    requireFact(!seen.has(key), 'Duplicate execution receipt');
    seen.add(key);
  }
}
function updateQuarantine(ledger, report, issues, options) {
  validateLedger(ledger);
  validateReport(report, options);
  requireFact(record(issues), 'Malformed Linear issue map');
  const next = structuredClone(ledger);
  const released = [];
  const added = [];
  const byFile = new Map();
  for (const row of report.observations) {
    const file = entryFile(mapToLedgerPath(row.file));
    const rows = byFile.get(file) || [];
    rows.push(row);
    byFile.set(file, rows);
  }
  // A missing checkout file is a handoff, never permission to prune a ledger.
  for (const entry of next.entries)
    requireFact(
      options.fileHash(entryFile(entry)),
      'Quarantined file missing from checkout'
    );
  for (const [file, observations] of byFile) {
    const fileHash = options.fileHash(file);
    if (!fileHash) continue;
    const rows = observations
      .filter(x => x.fileHash === fileHash)
      .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt));
    const flakes = rows.filter(
      x => x.outcome === 'flaky' && Date.parse(x.runAt) >= options.now - DAY
    );
    const mapped = mapToLedgerPath(file);
    let entry = next.entries.find(
      x => x.kind === mapped.kind && x.path === mapped.path
    );
    // Three run attempts, not three shards or deterministic failures.
    if (flakes.length >= 3 && !entry && LINEAR.test(issues[file] || '')) {
      entry = {
        id: `auto-${crypto.createHash('sha256').update(file).digest('hex').slice(0, 16)}`,
        ...mapped,
        owner: 'platform',
        firstSeenAt: flakes[0].runAt.slice(0, 10),
        reproductionCommand:
          mapped.kind === 'unit'
            ? `pnpm --filter @jovie/web exec vitest run ${mapped.path}`
            : `pnpm --filter @jovie/web exec playwright test ${mapped.path.slice(9)} --project=chromium`,
        fixIssueUrl: issues[file],
        expiresAt: new Date(options.now + 30 * DAY).toISOString().slice(0, 10),
        quarantinedAt: new Date(options.now).toISOString(),
        lastSeenFlakyAt: flakes.at(-1).runAt,
        consecutiveSuccesses: 0,
        autoManaged: true,
      };
      next.entries.push(entry);
      added.push(file);
    }
    if (!entry || entry.autoManaged !== true) continue;
    // Recompute from receipts, so replaying a report cannot add successes.
    const lastBad = rows.findLast(x => x.outcome !== 'clean');
    const lastBadTime = Math.max(
      Date.parse(
        entry.lastSeenFlakyAt || entry.quarantinedAt || entry.firstSeenAt
      ),
      lastBad ? Date.parse(lastBad.runAt) : 0
    );
    requireFact(Number.isFinite(lastBadTime), 'Invalid quarantine history');
    if (lastBad) entry.lastSeenFlakyAt = new Date(lastBadTime).toISOString();
    const clean = rows.filter(
      x => x.outcome === 'clean' && Date.parse(x.runAt) > lastBadTime
    );
    entry.consecutiveSuccesses = clean.length;
    if (clean.length >= 50 && options.now - lastBadTime >= 7 * DAY) {
      next.entries = next.entries.filter(x => x !== entry);
      released.push(file);
    }
  }
  const b = next.retryBudget;
  const retries =
    b.unitShardCount * b.unitDefaultRetries +
    next.entries.reduce(
      (n, e) =>
        n +
        (e.kind === 'unit' ? b.quarantineUnitRetries : b.quarantineE2eRetries),
      0
    );
  requireFact(
    retries <= b.maxRetryAttemptsPerCiRun,
    'Quarantine retry budget exceeded'
  );
  validateLedger(next);
  return {
    ledger: next,
    added,
    released,
    changed: JSON.stringify(ledger) !== JSON.stringify(next),
  };
}
function processQuarantine({ root = process.cwd(), now = Date.now() } = {}) {
  const ledgerPath = path.join(root, 'apps/web/tests/quarantine.json');
  const reportPath = path.join(root, 'quarantine-evidence.json');
  if (!fs.existsSync(reportPath))
    return {
      unquarantined: [],
      updated: false,
      reason: 'execution-evidence-unavailable',
    };
  const original = fs.readFileSync(ledgerPath, 'utf8');
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const result = updateQuarantine(
    JSON.parse(original),
    JSON.parse(fs.readFileSync(reportPath, 'utf8')),
    JSON.parse(fs.readFileSync(path.join(root, 'flake-issues.json'), 'utf8')),
    {
      now,
      headSha,
      fileHash: file =>
        fs.existsSync(path.join(root, file))
          ? crypto
              .createHash('sha256')
              .update(fs.readFileSync(path.join(root, file)))
              .digest('hex')
          : null,
    }
  );
  if (result.changed) {
    requireFact(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim() === headSha && fs.readFileSync(ledgerPath, 'utf8') === original,
      'Quarantine source lease changed'
    );
    fs.writeFileSync(ledgerPath, `${JSON.stringify(result.ledger, null, 2)}\n`);
  }
  return {
    unquarantined: result.released,
    updated: result.changed,
    added: result.added,
  };
}
if (require.main === module) {
  try {
    console.log(JSON.stringify(processQuarantine()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { mapToLedgerPath, updateQuarantine, processQuarantine };
