import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { listPullRequestQueueStates } from '../merge-queue-backend.mjs';
import { parseRequiredStatusChecksFromYaml } from './merge-queue-guard.mjs';

const execFileAsync = promisify(execFile);

/** Same agent-owned branch prefixes as scripts/drain-pr-queue.sh AGENT_RE. */
export const AGENT_BRANCH_RE =
  /^(tim\/|codex\/|agent\/|claude\/|linear\/|feat\/|dependabot\/|codegen-bot\/)/;

export const AGENT_BRANCH_RE_LEGACY = /(^|\/)jov-\d+/i;

export function isAgentBranch(headRefName) {
  if (!headRefName) return false;
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

// Exact names only. The harness manifest is the source of truth for staged
// evidence: jobs explicitly marked non-gates must not secretly block native
// queue enrollment through the controller's all-check scan.
export const ADVISORY_CHECK_NAMES = Object.freeze(
  [
    'A11y (authenticated, informational)',
    'Homepage Smoke (Informational)',
    'Open PR',
    'Preview Deploy',
    'Slop Gate (advisory)',
    // Historical check runs remain attached to existing PR heads after the
    // duplicate Agent PR Verify workflow is retired. They must not strand
    // drafts or native queue enrollment forever.
    'Verify Draft Agent PR',
    // Exact model/review checks are steering signals. They stay hosted and a
    // terminal failure cannot override the deterministic safety contract.
    'Classify PR taste',
    'Taste Label Guard',
    'Claude Review',
    'Seer Code Review',
    // PR Visual Review is explicitly advisory (workflow header + job name).
    // Terminal red must not dequeue green native-MQ members.
    'Capture changed UI (desktop + mobile) (advisory)',
    'Review screenshots and post advisory review',
    'PR Visual Review',
    // Hosted quality signals — not branch-protection required contexts.
    'SonarCloud Code Analysis',
    'Vercel Agent Review',
    'scope-judge',
    'Scope Alignment Check',
    // Folded into ci-fast's Structural Contract; retained for old PR heads
    // produced before the standalone workflow was retired from source events.
    'actionlint',
    // The pull_request-event run of fork-pr-gate cannot mint a jovie-bot token
    // (JOVIE_BOT_PRIVATE_KEY is only exposed to pull_request_target and
    // merge_group runs, which succeed) and fails at create-github-app-token,
    // leaving a red `Fork PR Gate Controller` check-run beside its SKIPPED
    // twin. The controller job is an orchestration receipt: the actual gate is
    // the required `Fork PR Gate` commit status, which stays fail-closed via
    // REQUIRED_CHECK_NAMES (missing/not-successful still blocks). Advisory
    // here is therefore equivalent to "only when the required four are green"
    // — any red required gate blocks on its own. See JOV-4782.
    'Fork PR Gate Controller',
    // Legacy evidence names can remain attached to already-open PR heads while
    // the manual-only job names roll out. They remain advisory for enrollment.
    'Lighthouse (public routes PR)',
    'Lighthouse (dashboard PR)',
    'Lighthouse (onboarding PR)',
    'Lighthouse (admin PR)',
    'E2E Smoke (PR Fast Feedback)',
    'Golden Path (PR)',
    'Extended Smoke (Preview)',
    'Preview Deploy (PR)',
    ...harnessManifest.jobs
      .filter(job => job.mergeGate !== true)
      .map(job => job.name),
    // Bounded fleet recovery selector. A pending/expired hold must never
    // classify as a product-quality gate or pin CLEAN enroll (JOV-5169).
    'jovie-fleet-queue-hold/v1',
    // Exact-head Gem controller failure receipt. This is the selector for a
    // safe replay, not a product-quality failure; the four required source
    // gates remain independently fail-closed.
    'jovie-gem-queue-remediation/v1',
  ].filter((name, index, names) => names.indexOf(name) === index)
);

// Controller runs are orchestration receipts, never product-quality gates.
// In particular, a failed controller attempt can be the *effect* of a stale
// label or transient queue mutation. Treating its `enroll` job as a source-CI
// failure creates a feedback loop: the next controller run sees its own red
// receipt, dequeues an otherwise green PR, and keeps it stranded. Scope this
// by workflow identity rather than by the generic job names so an unrelated
// `enroll` safety check still fails closed.
export const ADVISORY_CHECK_WORKFLOWS = Object.freeze([
  'Merge Queue Auto-Enroll',
]);

export const REQUIRED_CHECK_NAMES = Object.freeze(
  parseRequiredStatusChecksFromYaml(branchProtectionYaml).map(name => ({
    context: name,
    names: Object.freeze([name, name.replace(/^CI \/ /, '')]),
  }))
);

export const MERGE_GATE_CHECK_NAMES = Object.freeze(
  harnessManifest.jobs
    // This controller classifies source PR checks before native enrollment.
    // Queue-only unit/build/layout evidence is enforced by merge_group PR Ready.
    .filter(
      job =>
        job.mergeGate === true &&
        (job.gateStage === 'source-pr' || job.gateStage === 'both')
    )
    .map(job => job.name)
);

export function isAdvisoryCheckName(name) {
  const normalized = name ?? '';
  return (
    ADVISORY_CHECK_NAMES.includes(normalized) ||
    [
      'jovie-fleet-queue-hold/v1',
      'jovie-gem-queue-remediation/v1',
      'jovie-queue-reentry/v1',
    ].some(
      context =>
        normalized === context || normalized.startsWith(`${context}/pr-`)
    )
  );
}

export function isAdvisoryCheck(check) {
  return (
    isAdvisoryCheckName(normalizeCheckName(check)) ||
    ADVISORY_CHECK_WORKFLOWS.includes(check?.workflow ?? '')
  );
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
    if (isAdvisoryCheck(check)) continue;
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
    // Non-terminal-only groups (all skipped/neutral, or all successful, or all
    // pending) never block enrollment. Ambiguity only matters when terminal
    // outcomes disagree or a terminal red cannot be ordered against success.
    const allSkipped = candidates.every(isSkippedCheck);
    if (allSkipped) {
      collapsed.push(candidates[0]);
      continue;
    }
    const allSuccessful = candidates.every(isSuccessfulCheck);
    if (allSuccessful) {
      collapsed.push(candidates[0]);
      continue;
    }
    const allPending = candidates.every(isPendingCheck);
    if (allPending) {
      collapsed.push(candidates[0]);
      continue;
    }

    const ranked = candidates.map(check => ({
      check,
      startedAt: attemptTimestamp(check, 'startedAt'),
      completedAt: attemptTimestamp(check, 'completedAt'),
      observedAt: null,
    }));
    const missingTimestamps = ranked.some(
      attempt => attempt.startedAt === null || attempt.completedAt === null
    );
    if (missingTimestamps) {
      // Prefer a unique successful attempt over fail-closed noise when clocks
      // are missing; only fail closed if terminal red is also present.
      const successes = candidates.filter(isSuccessfulCheck);
      const failures = candidates.filter(isTerminalFailure);
      if (successes.length >= 1 && failures.length === 0) {
        collapsed.push(successes[0]);
        continue;
      }
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
      const top = ranked
        .filter(
          attempt =>
            attempt.observedAt === ranked[0].observedAt &&
            attempt.startedAt === ranked[0].startedAt &&
            attempt.completedAt === ranked[0].completedAt
        )
        .map(attempt => attempt.check);
      const topSuccess = top.filter(isSuccessfulCheck);
      const topFailure = top.filter(isTerminalFailure);
      if (topFailure.length > 0 && topSuccess.length > 0) {
        ambiguousNames.push(name);
        continue;
      }
      if (topFailure.length > 0) {
        collapsed.push(topFailure[0]);
        continue;
      }
      if (topSuccess.length > 0) {
        collapsed.push(topSuccess[0]);
        continue;
      }
      collapsed.push(top[0]);
      continue;
    }
    collapsed.push(ranked[0].check);
  }

  return { checks: collapsed, ambiguousNames: ambiguousNames.sort() };
}

/** Positive readiness proof shared by auto-ready and queue enrollment. */
export function classifyQueueCheckBlockers(checks) {
  const latest = collapseNewestCheckAttempts(checks);
  const allChecks = latest.checks;
  // Native enrollment is fail-closed for every terminal red check unless the
  // exact check name is explicitly advisory. A canonical allow-list is unsafe:
  // newly added safety jobs (for example Brand Scrub) would otherwise be
  // silently ignored until this controller was updated.
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

export function extractTerminalControlPlaneFailures(checks) {
  const latest = collapseNewestCheckAttempts(checks);
  return latest.checks
    .filter(
      check =>
        ADVISORY_CHECK_WORKFLOWS.includes(check?.workflow ?? '') &&
        isTerminalFailure(check)
    )
    .map(normalizeCheckName)
    .sort();
}

export const GEM_QUEUE_REMEDIATION_CONTEXT = 'jovie-gem-queue-remediation/v1';

export function gemQueueRemediationContextForPr(prNumber) {
  if (!Number.isInteger(Number(prNumber)) || Number(prNumber) < 1) {
    throw new Error('Gem queue remediation context requires a PR number');
  }
  return `${GEM_QUEUE_REMEDIATION_CONTEXT}/pr-${Number(prNumber)}`;
}

const AUTO_ENROLL_WORKFLOW_NAME = 'Merge Queue Auto-Enroll';
const AUTO_ENROLL_WORKFLOW_PATH =
  '.github/workflows/merge-queue-autoenroll.yml';
const JOVIE_BOT_LOGIN = 'jovie-bot[bot]';

function latestExactHeadControllerReceipt(combinedStatus, repo, prNumber) {
  const actionsPrefix = `https://github.com/${repo}/actions/runs/`;
  const descriptionPrefix = `PR #${prNumber}: `;
  const context = gemQueueRemediationContextForPr(prNumber);
  const status = (combinedStatus?.statuses ?? [])
    .filter(candidate => {
      if (
        candidate?.context !== context ||
        !candidate?.target_url?.startsWith(actionsPrefix) ||
        !candidate?.description?.startsWith(descriptionPrefix)
      ) {
        return false;
      }
      return /^[1-9][0-9]*$/.test(
        candidate.target_url.slice(actionsPrefix.length)
      );
    })
    .sort((left, right) =>
      String(left?.updated_at ?? '').localeCompare(
        String(right?.updated_at ?? '')
      )
    )
    .at(-1);
  if (!status) return null;
  return {
    runId: status.target_url.slice(actionsPrefix.length),
    status,
  };
}

function isControllerStatusCreatorProvenance(
  status,
  repo,
  {
    headRefOid = '',
    botAvatarUrl = '',
    apiBaseUrl = 'https://api.github.com',
  } = {}
) {
  if (
    status?.creator?.type === 'Bot' &&
    status.creator.login === JOVIE_BOT_LOGIN
  ) {
    return true;
  }
  return Boolean(
    status?.creator === null &&
      /^[0-9a-f]{40}$/.test(headRefOid) &&
      typeof botAvatarUrl === 'string' &&
      botAvatarUrl.length > 0 &&
      status?.avatar_url === botAvatarUrl &&
      status?.url === `${apiBaseUrl}/repos/${repo}/statuses/${headRefOid}`
  );
}

export function isAutoEnrollRunProvenance(run, repo, runId) {
  const targetUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  return Boolean(
    String(run?.id ?? '') === runId &&
      run?.name === AUTO_ENROLL_WORKFLOW_NAME &&
      (run?.path === AUTO_ENROLL_WORKFLOW_PATH ||
        run?.path?.startsWith(`${AUTO_ENROLL_WORKFLOW_PATH}@`)) &&
      run?.html_url === targetUrl &&
      run?.repository?.full_name === repo &&
      run?.head_repository?.full_name === repo &&
      typeof run?.workflow_id === 'number' &&
      typeof run?.run_attempt === 'number' &&
      run.run_attempt >= 1
  );
}

export function extractExactHeadControllerFailures(
  combinedStatus,
  repo,
  prNumber,
  run,
  creatorProof = {}
) {
  const receipt = latestExactHeadControllerReceipt(
    combinedStatus,
    repo,
    prNumber
  );
  return receipt &&
    ['error', 'failure'].includes(receipt.status.state) &&
    isControllerStatusCreatorProvenance(receipt.status, repo, creatorProof) &&
    isAutoEnrollRunProvenance(run, repo, receipt.runId)
    ? [GEM_QUEUE_REMEDIATION_CONTEXT]
    : [];
}

/** Controller failures stay advisory to product quality but actionable by Gem. */
export async function fetchControlPlaneFailures(repo, prNumber, headRefOid) {
  let checkFailures = [];
  try {
    const checks = await ghJson(
      [
        'pr',
        'checks',
        String(prNumber),
        '--json',
        'name,bucket,state,workflow,description,startedAt,completedAt',
      ],
      { repo }
    );
    checkFailures = extractTerminalControlPlaneFailures(checks);
  } catch (error) {
    const stdout = error.stdout?.trim();
    if (stdout) {
      try {
        checkFailures = extractTerminalControlPlaneFailures(JSON.parse(stdout));
      } catch {
        // fall through
      }
    }
  }
  let exactHeadFailures = [];
  if (/^[0-9a-f]{40}$/.test(headRefOid ?? '')) {
    try {
      const combinedStatus = await ghJson([
        'api',
        `repos/${repo}/commits/${headRefOid}/status`,
      ]);
      const receipt = latestExactHeadControllerReceipt(
        combinedStatus,
        repo,
        prNumber
      );
      if (receipt && ['error', 'failure'].includes(receipt.status.state)) {
        let botAvatarUrl = '';
        if (receipt.status.creator === null) {
          const bot = await ghJson([
            'api',
            `users/${encodeURIComponent(JOVIE_BOT_LOGIN)}`,
          ]);
          if (
            bot?.login !== JOVIE_BOT_LOGIN ||
            bot?.type !== 'Bot' ||
            typeof bot?.avatar_url !== 'string'
          ) {
            throw new Error('Jovie Bot identity provenance is unavailable');
          }
          botAvatarUrl = bot.avatar_url;
        }
        const run = await ghJson([
          'api',
          `repos/${repo}/actions/runs/${receipt.runId}`,
        ]);
        exactHeadFailures = extractExactHeadControllerFailures(
          combinedStatus,
          repo,
          prNumber,
          run,
          {
            headRefOid,
            botAvatarUrl,
            apiBaseUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
          }
        );
      }
    } catch {
      // Unknown exact-head receipt is a no-mutation signal, not permission.
    }
  }
  return [...new Set([...checkFailures, ...exactHeadFailures])].sort();
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
      'number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRefOid,baseRefName,updatedAt,headRepository,headRepositoryOwner,isCrossRepository',
    ],
    { repo }
  );
}

const REMEDIATION_RECEIPT_SCHEMA = 'jovie-gem-remediation/v1';
const REMEDIATION_COMMENT_MARKER = 'drain-auto-rebase';

export function isTrustedExactHeadConflictReceipt(
  comment,
  { repo, prNumber, headRefOid }
) {
  if (
    comment?.user?.login !== JOVIE_BOT_LOGIN ||
    comment?.user?.type !== 'Bot' ||
    !/^[0-9a-f]{40}$/.test(headRefOid ?? '')
  ) {
    return false;
  }
  const body = comment?.body ?? '';
  if (
    !body.includes(
      `<!-- bot-comment:${REMEDIATION_COMMENT_MARKER}-${headRefOid} -->`
    )
  ) {
    return false;
  }
  const match = body.match(/```json\s*([\s\S]*?)```/);
  if (!match) return false;
  try {
    const receipt = JSON.parse(match[1]);
    return (
      receipt?.schema === REMEDIATION_RECEIPT_SCHEMA &&
      receipt?.repo === repo &&
      receipt?.pr === prNumber &&
      receipt?.expectedHead === headRefOid &&
      receipt?.category === 'conflict' &&
      receipt?.result === 'escalated'
    );
  } catch {
    return false;
  }
}

async function hasTrustedExactHeadConflictReceipt(repo, prNumber, headRefOid) {
  try {
    const pages = await ghJson([
      'api',
      '--paginate',
      '--slurp',
      `repos/${repo}/issues/${prNumber}/comments?per_page=100`,
    ]);
    const comments = Array.isArray(pages?.[0]) ? pages.flat() : (pages ?? []);
    return comments.some(comment =>
      isTrustedExactHeadConflictReceipt(comment, {
        repo,
        prNumber,
        headRefOid,
      })
    );
  } catch {
    // A missing read cannot prove the exact-head escalation exists. Re-select
    // the confirmed conflict so the idempotent trusted-author upsert retries.
    return false;
  }
}

const HARD_GATE_LABELS = new Set([
  'blocked',
  'needs-human',
  'hold',
  'gated',
  'queue-deferred',
  'fast',
  'human-review-required',
  'needs-human-review',
  'needs-manual-rebase',
  'no-auto',
  'risk:high',
]);

export function isHardGated(labels) {
  return (labels ?? []).some(label =>
    HARD_GATE_LABELS.has(label.name ?? label)
  );
}

export function isSameRepoPr(pr, repo) {
  if (pr.isCrossRepository === true) return false;
  const nameWithOwner = pr.headRepository?.nameWithOwner;
  if (nameWithOwner) {
    return nameWithOwner.toLowerCase() === repo.toLowerCase();
  }
  const owner = pr.headRepositoryOwner?.login;
  if (!owner) return false;
  const [repoOwner] = repo.split('/');
  return owner.toLowerCase() === repoOwner?.toLowerCase();
}

function hasRemediationIdentity(pr, repo) {
  return (
    !pr.isDraft &&
    pr.baseRefName === 'main' &&
    isAgentBranch(pr.headRefName) &&
    !pr.headRefName.startsWith('dependabot/') &&
    !isHardGated(pr.labels) &&
    isSameRepoPr(pr, repo) &&
    /^[0-9a-f]{40}$/.test(pr.headRefOid ?? '')
  );
}

function hasUnownedNativeQueueState(pr) {
  const state = pr.nativeQueueState;
  return Boolean(
    state &&
      state.headRefOid?.toLowerCase() === pr.headRefOid &&
      state.queued === false &&
      state.autoMergeEnabled === false
  );
}

export async function fetchExactHeadUpdatedAt(repo, headRefOid) {
  try {
    const commit = await ghJson(['api', `repos/${repo}/commits/${headRefOid}`]);
    return (
      commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Classify one exact PR head for bounded mechanical remediation. Product-code
 * failures, stale branches, and confirmed conflicts are distinct reasons; the
 * caller never turns this classification into merge admission.
 */
export function classifyRemediationCandidate(
  pr,
  repo,
  failures = [],
  controlPlaneFailures = []
) {
  if (!hasRemediationIdentity(pr, repo) || !hasUnownedNativeQueueState(pr)) {
    return null;
  }

  const reasons = [];
  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    // A confirmed conflict is escalated once. The durable label + exact-head
    // receipt is the human/Symphony selector; repeatedly selecting the same
    // unchanged conflict would starve later stale heads in a bounded pass.
    if (pr.hasTrustedExactHeadConflictReceipt === true) {
      return null;
    }
    reasons.push('merge_conflict');
  } else if (pr.mergeStateStatus === 'BEHIND') {
    reasons.push('branch_behind');
  } else if (
    pr.mergeable === 'MERGEABLE' &&
    (pr.labels ?? []).some(
      label => (label.name ?? label) === 'needs-conflict-resolution'
    )
  ) {
    reasons.push('stale_conflict_label');
  }
  // Pure product-check failures belong to Symphony, while exact controller
  // failure receipts are replayed by drain-pr-queue.sh. Neither is a reason to
  // mutate a current branch; retain them only as context when a stale/conflict
  // reason independently authorizes mechanical remediation.
  if (reasons.length === 0) return null;

  return {
    ...pr,
    failures,
    controlPlaneFailures,
    reasons,
  };
}

/** Returns exact agent PR heads that need refresh or structured escalation. */
export async function listBlockedAgentPrs(repo, { limit = 200 } = {}) {
  const [prs, nativeQueueStates] = await Promise.all([
    fetchOpenPrSummaries(repo, limit),
    listPullRequestQueueStates({ backend: 'native', repository: repo }),
  ]);
  const blocked = [];

  for (const summary of prs) {
    const pr = {
      ...summary,
      nativeQueueState: nativeQueueStates[String(summary.number)] ?? null,
    };
    if (!hasRemediationIdentity(pr, repo)) continue;
    if (
      (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') &&
      (pr.labels ?? []).some(
        label => (label.name ?? label) === 'needs-conflict-resolution'
      )
    ) {
      pr.hasTrustedExactHeadConflictReceipt =
        await hasTrustedExactHeadConflictReceipt(
          repo,
          pr.number,
          pr.headRefOid
        );
    }
    const [failures, controlPlaneFailures] = await Promise.all([
      fetchRequiredCheckFailures(repo, pr.number),
      fetchControlPlaneFailures(repo, pr.number, pr.headRefOid),
    ]);
    const candidate = classifyRemediationCandidate(
      pr,
      repo,
      failures,
      controlPlaneFailures
    );
    if (candidate) {
      candidate.headUpdatedAt = await fetchExactHeadUpdatedAt(
        repo,
        candidate.headRefOid
      );
      blocked.push(candidate);
    }
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
    // `--classify-auto-ready` is a compatibility alias for the canonical queue
    // policy. The retired Agent PR Verify workflow must not remain a hidden
    // prerequisite for draft promotion.
    const blockers = classifyQueueCheckBlockers(checks);
    process.stdout.write(`${JSON.stringify(blockers)}\n`);
  }
}
