import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseRequiredStatusChecksFromYaml } from './merge-queue-guard.mjs';

const execFileAsync = promisify(execFile);

/** Same agent-owned branch prefixes as scripts/drain-pr-queue.sh AGENT_RE. */
export const AGENT_BRANCH_RE =
  /^(tim\/|codex\/|agent\/|claude\/|linear\/|feat\/|dependabot\/|codegen-bot\/)/;

export const AGENT_BRANCH_RE_LEGACY = /(^|\/)jov-\d+/i;

export function isAgentBranch(headRefName) {
  if (!headRefName) return false;
  if (headRefName.startsWith('gtmq_')) return false;
  return (
    AGENT_BRANCH_RE.test(headRefName) ||
    AGENT_BRANCH_RE_LEGACY.test(headRefName)
  );
}

export function normalizeCheckName(check) {
  return (
    check?.name ?? check?.workflow ?? check?.description ?? 'unnamed check'
  );
}

// Exact names only. Merge-gate names such as `Preview Deploy (PR)` and
// `E2E Smoke (PR Fast Feedback)` must never become advisory because they share
// words with an informational check.
export const ADVISORY_CHECK_NAMES = Object.freeze([
  'A11y (authenticated, informational)',
  'Homepage Smoke (Informational)',
  'Open PR',
  'Preview Deploy',
  'Slop Gate (advisory)',
]);

const branchProtectionYaml = readFileSync(
  new URL('../../.github/rulesets/branch-protection.yml', import.meta.url),
  'utf8'
);
const harnessManifest = JSON.parse(
  readFileSync(
    new URL('../../.github/ci-harness/manifest.json', import.meta.url),
    'utf8'
  )
);

export const REQUIRED_CHECK_NAMES = Object.freeze(
  parseRequiredStatusChecksFromYaml(branchProtectionYaml).map(name => ({
    context: name,
    names: Object.freeze([name, name.replace(/^CI \/ /, '')]),
  }))
);

export const MERGE_GATE_CHECK_NAMES = Object.freeze(
  harnessManifest.jobs
    .filter(job => job.mergeGate === true)
    .map(job => job.name)
);

export function isAdvisoryCheckName(name) {
  return ADVISORY_CHECK_NAMES.includes(name ?? '');
}

/**
 * Terminal failures only — mirrors scripts/drain-pr-queue.sh check_failures_for_pr.
 * Pending/queued/cancelled runs are not failures.
 */
export function isTerminalFailure(check) {
  const bucket = String(check?.bucket ?? '').toLowerCase();
  const state = String(check?.state ?? '').toUpperCase();
  if (bucket === 'fail') return true;
  return /^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$/.test(
    state
  );
}

export function extractTerminalFailures(checks) {
  const names = new Set();
  for (const check of checks ?? []) {
    if (!isTerminalFailure(check)) continue;
    const name = normalizeCheckName(check);
    if (isAdvisoryCheckName(name)) continue;
    names.add(name);
  }
  return [...names].sort();
}

function isSuccessfulCheck(check) {
  return (
    String(check?.bucket ?? '').toLowerCase() === 'pass' &&
    String(check?.state ?? '').toUpperCase() === 'SUCCESS'
  );
}

function isSkippedCheck(check) {
  const bucket = String(check?.bucket ?? '').toLowerCase();
  const state = String(check?.state ?? '').toUpperCase();
  return bucket === 'skipping' || state === 'SKIPPED' || state === 'NEUTRAL';
}

function isPendingCheck(check) {
  const bucket = String(check?.bucket ?? '').toLowerCase();
  const state = String(check?.state ?? '').toUpperCase();
  return (
    bucket === 'pending' ||
    /^(QUEUED|IN_PROGRESS|PENDING|WAITING|REQUESTED|EXPECTED)$/.test(state)
  );
}

function attemptTimestamp(check, field) {
  const value = String(check?.[field] ?? '');
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * GitHub may return superseded attempts with the same normalized name. Keep
 * only the uniquely newest (startedAt, completedAt) tuple. Missing timestamps
 * or an equal newest tuple are ambiguous and therefore fail closed. A skipped
 * duplicate is non-evidence when the group already contains a success, but a
 * newer pending or terminal attempt still supersedes that success.
 */
export function collapseNewestCheckAttempts(checks) {
  const groups = new Map();
  for (const check of checks ?? []) {
    const name = normalizeCheckName(check);
    const group = groups.get(name) ?? [];
    group.push(check);
    groups.set(name, group);
  }

  const collapsed = [];
  const ambiguousNames = [];
  for (const [name, group] of groups) {
    if (group.length === 1) {
      collapsed.push(group[0]);
      continue;
    }

    // A skipped duplicate carries no new gate result. Preserve an existing
    // success unless a newer pending or terminal attempt supplies real state.
    const candidates = group.some(isSuccessfulCheck)
      ? group.filter(check => !isSkippedCheck(check))
      : group;
    if (candidates.length === 1) {
      collapsed.push(candidates[0]);
      continue;
    }
    const ranked = candidates.map(check => ({
      check,
      startedAt: attemptTimestamp(check, 'startedAt'),
      completedAt: attemptTimestamp(check, 'completedAt'),
      observedAt: null,
    }));
    if (
      ranked.some(
        attempt => attempt.startedAt === null || attempt.completedAt === null
      )
    ) {
      ambiguousNames.push(name);
      continue;
    }
    for (const attempt of ranked) {
      attempt.observedAt = Math.max(attempt.startedAt, attempt.completedAt);
    }
    ranked.sort(
      (left, right) =>
        right.observedAt - left.observedAt ||
        right.startedAt - left.startedAt ||
        right.completedAt - left.completedAt
    );
    if (
      ranked[0].observedAt === ranked[1].observedAt &&
      ranked[0].startedAt === ranked[1].startedAt &&
      ranked[0].completedAt === ranked[1].completedAt
    ) {
      ambiguousNames.push(name);
      continue;
    }
    collapsed.push(ranked[0].check);
  }

  return { checks: collapsed, ambiguousNames: ambiguousNames.sort() };
}

/** Positive readiness proof shared by auto-ready and queue enrollment. */
export function classifyQueueCheckBlockers(
  checks,
  { requireVerifyDraft = false } = {}
) {
  const latest = collapseNewestCheckAttempts(checks);
  const allChecks = latest.checks;
  const blockers = new Set(extractTerminalFailures(allChecks));
  for (const name of latest.ambiguousNames) {
    if (!isAdvisoryCheckName(name)) {
      blockers.add(`${name} (ambiguous latest attempt)`);
    }
  }

  for (const required of REQUIRED_CHECK_NAMES) {
    const matches = allChecks.filter(check =>
      required.names.includes(normalizeCheckName(check))
    );
    if (matches.length === 0) {
      blockers.add(`${required.context} (missing)`);
      continue;
    }
    if (matches.some(isPendingCheck)) {
      blockers.add(`${required.context} (pending)`);
    }
    if (!matches.some(isSuccessfulCheck)) {
      blockers.add(`${required.context} (not successful)`);
    }
  }

  for (const name of MERGE_GATE_CHECK_NAMES) {
    const matches = allChecks.filter(
      check => normalizeCheckName(check) === name
    );
    if (matches.length === 0) continue;
    if (matches.some(isPendingCheck)) {
      blockers.add(`${name} (pending)`);
    }
    if (
      !matches.some(check => isSuccessfulCheck(check) || isSkippedCheck(check))
    ) {
      blockers.add(`${name} (not complete)`);
    }
  }

  if (requireVerifyDraft) {
    const matches = allChecks.filter(
      check => normalizeCheckName(check) === 'Verify Draft Agent PR'
    );
    if (matches.some(isPendingCheck)) {
      blockers.add('Verify Draft Agent PR (pending)');
    }
    if (!matches.some(isSuccessfulCheck)) {
      blockers.add('Verify Draft Agent PR (missing exact-head success)');
    }
  }

  return [...blockers].sort();
}

async function ghJson(args, { repo } = {}) {
  const fullArgs = [...args];
  if (repo) {
    fullArgs.push('-R', repo);
  }
  const { stdout } = await execFileAsync('gh', fullArgs, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/**
 * Fetch terminal failing required checks for a PR.
 * `gh pr checks` exits 8 when checks are pending but may still return JSON.
 */
export async function fetchRequiredCheckFailures(repo, prNumber) {
  try {
    const checks = await ghJson(
      [
        'pr',
        'checks',
        String(prNumber),
        '--required',
        '--json',
        'name,bucket,state,workflow,description',
      ],
      { repo }
    );
    return extractTerminalFailures(checks);
  } catch (error) {
    const stdout = error.stdout?.trim();
    if (stdout) {
      try {
        const checks = JSON.parse(stdout);
        return extractTerminalFailures(checks);
      } catch {
        // fall through
      }
    }
    return [];
  }
}

export async function fetchOpenPrSummaries(repo, limit = 200) {
  return ghJson(
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      String(limit),
      '--json',
      'number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,updatedAt,headRepositoryOwner',
    ],
    { repo }
  );
}

const HARD_GATE_LABELS = new Set(['needs-human', 'hold', 'gated']);

export function isHardGated(labels) {
  return (labels ?? []).some(label =>
    HARD_GATE_LABELS.has(label.name ?? label)
  );
}

export function isSameRepoPr(pr, repo) {
  const owner = pr.headRepositoryOwner?.login;
  if (!owner) return true;
  const [repoOwner] = repo.split('/');
  return owner === repoOwner;
}

/**
 * Returns open agent PRs that are mergeable with terminal failing required checks.
 */
export async function listBlockedAgentPrs(repo, { limit = 200 } = {}) {
  const prs = await fetchOpenPrSummaries(repo, limit);
  const blocked = [];

  for (const pr of prs) {
    if (pr.isDraft) continue;
    if (pr.mergeable !== 'MERGEABLE') continue;
    if (!isAgentBranch(pr.headRefName)) continue;
    if (isHardGated(pr.labels)) continue;
    if (!isSameRepoPr(pr, repo)) continue;

    const failures = await fetchRequiredCheckFailures(repo, pr.number);
    if (failures.length === 0) continue;

    blocked.push({
      number: pr.number,
      title: pr.title,
      headRefName: pr.headRefName,
      updatedAt: pr.updatedAt,
      failures,
    });
  }

  return blocked;
}

/**
 * Count how many open agent PRs share each failing required check name.
 */
export async function detectSystemicFailures(
  repo,
  prNumber,
  { threshold = 3, limit = 200 } = {}
) {
  const thisFails = await fetchRequiredCheckFailures(repo, prNumber);
  if (thisFails.length === 0) {
    return { isSystemic: false, checks: [], failCountByCheck: {} };
  }

  const prs = await fetchOpenPrSummaries(repo, limit);
  const failCountByCheck = Object.fromEntries(
    thisFails.map(check => [check, 1])
  );

  for (const pr of prs) {
    if (pr.number === prNumber) continue;
    if (pr.isDraft) continue;
    if (!isAgentBranch(pr.headRefName)) continue;

    const failures = await fetchRequiredCheckFailures(repo, pr.number);
    for (const check of failures) {
      if (!failCountByCheck[check]) continue;
      failCountByCheck[check] += 1;
    }
  }

  const systemicChecks = Object.entries(failCountByCheck)
    .filter(([, count]) => count >= threshold)
    .map(([check, count]) => ({ check, count }));

  return {
    isSystemic: systemicChecks.length > 0,
    checks: systemicChecks,
    failCountByCheck,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === '--advisory-json') {
    process.stdout.write(`${JSON.stringify(ADVISORY_CHECK_NAMES)}\n`);
  } else if (
    process.argv[2] === '--classify-queue' ||
    process.argv[2] === '--classify-auto-ready'
  ) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const checks = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const blockers = classifyQueueCheckBlockers(checks, {
      requireVerifyDraft: process.argv[2] === '--classify-auto-ready',
    });
    process.stdout.write(`${JSON.stringify(blockers)}\n`);
  }
}
