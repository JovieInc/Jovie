import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

export function isAdvisoryCheckName(name) {
  return /advisory|Preview Deploy|Slop Gate/i.test(name ?? '');
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
