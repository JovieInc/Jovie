#!/usr/bin/env node

/**
 * Update Quarantine Ledger
 *
 * Consumes flakiness-clusters.json (produced by analyze-test-flakiness.js) and
 * flake-issues.json (signature -> tracking issue URL, produced by the filing
 * step), then updates apps/web/tests/quarantine.json using the schemaVersion 1
 * entries format validated by apps/web/lib/testing/quarantine-ledger.ts:
 *
 *   - Quarantine: a failure signature with >= 3 occurrences in a rolling 24h
 *     window gets an entry. Quarantined tests still run in CI in the
 *     non-blocking "Run quarantined unit tests (retries)" lane.
 *   - Un-quarantine: an entry whose signature has not recurred for
 *     UNQUARANTINE_STABLE_DAYS consecutive days, or that has accumulated
 *     UNQUARANTINE_MIN_SUCCESSES consecutive clean report windows, is removed.
 *   - Prune: entries whose test file no longer exists are removed.
 *   - expiresAt acts as a safety net (auto-expire) on every auto-added entry.
 *
 * Extra entry fields (signatureHash, quarantinedAt, lastSeenFlakyAt,
 * flakeCount) are preserved verbatim by the parser.
 *
 * Usage:
 *   node .github/scripts/update-quarantine.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const QUARANTINE_PATH = path.join(REPO_ROOT, 'apps/web/tests/quarantine.json');
const CLUSTERS_PATH = path.join(REPO_ROOT, 'flakiness-clusters.json');
const ISSUES_PATH = path.join(REPO_ROOT, 'flake-issues.json');

const UNQUARANTINE_STABLE_DAYS = 7;
const UNQUARANTINE_MIN_SUCCESSES = 50;
const AUTO_ENTRY_TTL_DAYS = 30; // auto-expiry safety net
const MS_PER_DAY = 24 * 3600 * 1000;
const DEFAULT_FIX_ISSUE = 'https://linear.app/jovie/issue/JOV-6507';

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse ${file}: ${error.message}`);
    return fallback;
  }
}

/**
 * Derive an owning area from a test path: the first meaningful directory under
 * tests/ (e.g. tests/unit/dashboard/x.test.ts -> dashboard).
 */
function owningAreaFor(file) {
  const segments = String(file).split('/').filter(Boolean);
  const testsIdx = segments.findIndex(s => s === 'tests');
  const rest = testsIdx >= 0 ? segments.slice(testsIdx + 1) : segments;
  const bucket = rest[0] || 'unknown';
  if (!['unit', 'e2e', 'contracts', 'integration'].includes(bucket)) {
    return bucket;
  }
  return rest[1] && !rest[1].includes('.') ? rest[1] : bucket;
}

/**
 * Map a junit file path to a ledger { kind, path } pair. Unit paths are
 * relative to apps/web; e2e paths are repo-root relative. Returns null when
 * the file does not look like a runnable test file.
 */
function mapToLedgerPath(file) {
  if (!file) return null;
  const f = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  if (f.startsWith('apps/web/')) {
    const rel = f.slice('apps/web/'.length);
    if (/^tests\/e2e\/.*\.spec\.ts$/.test(rel)) return { kind: 'e2e', path: f };
    if (/^tests\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/.test(rel))
      return { kind: 'unit', path: rel };
    return null;
  }
  if (/^tests\/e2e\/.*\.spec\.ts$/.test(f))
    return { kind: 'e2e', path: `apps/web/${f}` };
  if (/^tests\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f))
    return { kind: 'unit', path: f };
  return null;
}

function reproductionCommandFor(kind, p) {
  return kind === 'unit'
    ? `pnpm --filter @jovie/web exec vitest run ${p}`
    : `cd apps/web && pnpm playwright test ${p.replace(/^apps\/web\//, '')} --project=chromium`;
}

function fileExistsOnDisk(kind, p) {
  const abs =
    kind === 'unit'
      ? path.join(REPO_ROOT, 'apps/web', p)
      : path.join(REPO_ROOT, p);
  return fs.existsSync(abs);
}

function writeOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
}

function main() {
  const quarantine = loadJson(QUARANTINE_PATH, null);
  if (!quarantine || !Array.isArray(quarantine.entries)) {
    console.error(
      'quarantine.json missing or not schemaVersion-1 format; refusing to update'
    );
    process.exit(1);
  }

  const clusters = loadJson(CLUSTERS_PATH, { clusters: [] }).clusters || [];
  const issueMap = loadJson(ISSUES_PATH, {});
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.split('T')[0];
  const expiresAt = new Date(now.getTime() + AUTO_ENTRY_TTL_DAYS * MS_PER_DAY)
    .toISOString()
    .split('T')[0];

  const clusterBySig = new Map(clusters.map(c => [c.signature, c]));
  const newlyQuarantined = [];
  const unquarantined = [];
  const pruned = [];

  // 1. Quarantine candidates.
  for (const cluster of clusters) {
    if (!cluster.quarantineCandidate) continue;
    const mapped = mapToLedgerPath(cluster.file);
    if (!mapped) {
      console.log(
        `Skipping ${cluster.signature}: no mappable test file (${cluster.file})`
      );
      continue;
    }

    const existing = quarantine.entries.find(
      e => e.signatureHash === cluster.signature || e.path === mapped.path
    );
    if (existing) {
      existing.flakeCount = (existing.flakeCount || 0) + cluster.occurrences24h;
      existing.lastSeenFlakyAt = cluster.lastSeenAt || nowIso;
      existing.consecutiveSuccesses = 0;
      existing.signatureHash = existing.signatureHash || cluster.signature;
      if (!existing.fixIssueUrl && issueMap[cluster.signature]) {
        existing.fixIssueUrl = issueMap[cluster.signature];
      }
      continue;
    }

    quarantine.entries.push({
      id: `auto-${cluster.signature}`,
      kind: mapped.kind,
      path: mapped.path,
      owner: owningAreaFor(mapped.path),
      firstSeenAt: (cluster.firstSeenAt || today).split('T')[0],
      reproductionCommand: reproductionCommandFor(mapped.kind, mapped.path),
      fixIssueUrl: issueMap[cluster.signature] || DEFAULT_FIX_ISSUE,
      expiresAt,
      consecutiveSuccesses: 0,
      signatureHash: cluster.signature,
      quarantinedAt: nowIso,
      lastSeenFlakyAt: cluster.lastSeenAt || nowIso,
      flakeCount: cluster.occurrences24h,
      reason: `Auto-quarantined: >=3 failures in 24h for signature ${cluster.signature}`,
      errorExcerpt: cluster.errorExcerpt || '',
      exampleRuns: (cluster.runUrls || []).slice(0, 5),
    });
    newlyQuarantined.push(mapped.path);
    console.log(`Quarantined ${mapped.path} (signature ${cluster.signature})`);
  }

  // 2. Prune entries whose test file no longer exists (integrity: a
  //    quarantined test that disappears must not linger silently).
  quarantine.entries = quarantine.entries.filter(entry => {
    if (fileExistsOnDisk(entry.kind, entry.path)) return true;
    pruned.push(entry.path);
    console.log(`Pruned ${entry.path}: file no longer exists`);
    return false;
  });

  // 3. Un-quarantine: signature absent from clusters -> count a clean window.
  quarantine.entries = quarantine.entries.filter(entry => {
    const sig = entry.signatureHash;
    const recurred = sig && clusterBySig.has(sig);
    if (recurred) {
      entry.consecutiveSuccesses = 0;
      return true;
    }

    const lastFlaky = Date.parse(
      entry.lastSeenFlakyAt || entry.quarantinedAt || entry.firstSeenAt
    );
    const stableDays = Number.isFinite(lastFlaky)
      ? (now.getTime() - lastFlaky) / MS_PER_DAY
      : UNQUARANTINE_STABLE_DAYS;

    // Entries without a signature (manual quarantines) still age out via
    // consecutiveSuccesses only — never by the stable-days rule.
    const consecutive = (entry.consecutiveSuccesses || 0) + 1;
    const stableEnough =
      (sig && stableDays >= UNQUARANTINE_STABLE_DAYS) ||
      consecutive >= UNQUARANTINE_MIN_SUCCESSES;

    if (!stableEnough) {
      entry.consecutiveSuccesses = consecutive;
      return true;
    }

    unquarantined.push({ file: entry.path, issueUrl: entry.fixIssueUrl });
    console.log(
      `Un-quarantined ${entry.path}: ${sig ? `${stableDays.toFixed(1)}d stable` : `${consecutive} clean windows`}`
    );
    return false;
  });

  // Membership changes and recurrence refreshes (lastSeenFlakyAt on a
  // re-flaking signature) must be committed — the latter prevents a false
  // 7-day-stable un-quarantine. Bare counter increments are not committed
  // alone to avoid a daily churn PR.
  const changed =
    newlyQuarantined.length > 0 ||
    unquarantined.length > 0 ||
    pruned.length > 0 ||
    quarantine.entries.some(
      e => e.signatureHash && clusterBySig.has(e.signatureHash)
    );

  if (changed) {
    fs.writeFileSync(
      QUARANTINE_PATH,
      JSON.stringify(quarantine, null, 2) + '\n'
    );
    console.log(`Updated ${QUARANTINE_PATH}`);
  } else {
    console.log('No quarantine changes.');
  }

  writeOutputs({
    changed: changed ? 'true' : 'false',
    newly_quarantined: newlyQuarantined.join(','),
    unquarantined: unquarantined.map(u => u.file).join(','),
    pruned: pruned.join(','),
  });

  fs.writeFileSync(
    path.join(REPO_ROOT, 'quarantine-changes.json'),
    JSON.stringify(
      { newlyQuarantined, unquarantined, pruned, generatedAt: nowIso },
      null,
      2
    )
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { owningAreaFor, mapToLedgerPath };
