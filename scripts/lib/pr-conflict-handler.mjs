export const DEFAULT_REQUIRED_CHECKS = Object.freeze([
  'CI / PR Ready',
  'CI / Migration Guard',
  'Fork PR Gate',
]);

export const DEFAULT_BLOCKED_LABEL = 'needs-ci-fix';
export const CONFLICT_CLOSED_LOOP_INVARIANT_ID = 'JOV-INV-021';
export const CONFLICT_FX_STATUS_CONTEXT = 'Jovie Conflict FX';
export const CONFLICT_FX_RECEIPT_SCHEMA = 'jovie-conflict-fx/v1';
export const CONFLICT_FX_COHORT_SCHEMA = 'jovie-conflict-fx-cohort/v1';
export const CONFLICT_STEERING_EXCEPTION_SCHEMA =
  'jovie-conflict-steering-exception/v1';
export const CONFLICT_FX_MODEL = 'openai/gpt-5.6-sol';
export const CONFLICT_FX_MAX_ATTEMPTS = 2;
export const CONFLICT_FX_CLAIM_TTL_MS = 20 * 60 * 1000;
export const CONFLICT_FX_COHORT_TIERS = Object.freeze([2, 10, 40]);
export const CONFLICT_FX_COHORT_MARKER_PREFIX = 'jovie-conflict-fx-cohort:v1:';
export const CONFLICT_PERMISSION_EXCEPTION_SCHEMA =
  'jovie-conflict-permission-exception/v1';
export const CONFLICT_FX_TRUSTED_ACTORS = Object.freeze(['jovie-bot[bot]']);
export const CONFLICT_FX_MAX_HEALTHY_CI_LATENCY_MS = 12 * 60 * 1000;
export const CONFLICT_FX_MAX_CI_LATENCY_REGRESSION_RATIO = 1.5;

const TERMINAL_FAILURES = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'STALE',
]);

const RUNNING_STATES = new Set([
  'PENDING',
  'EXPECTED',
  'QUEUED',
  'REQUESTED',
  'WAITING',
  'IN_PROGRESS',
  'IN_PROGRESS_MANUAL',
]);

const SUCCESS_STATES = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function timeValue(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function checkTimestamp(check) {
  return Math.max(timeValue(check.completedAt), timeValue(check.startedAt));
}

function normalizeCheckName(name) {
  return String(name ?? '')
    .replace(/^CI\s*\/\s*/i, '')
    .trim();
}

function canonicalRequiredKey(name) {
  return normalizeCheckName(name).toLowerCase();
}

function labelNames(labels = []) {
  return labels
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

function checkName(check) {
  return check.name ?? check.context ?? '';
}

function checkState(check) {
  if (check.__typename === 'StatusContext') {
    return upper(check.state);
  }
  const status = upper(check.status);
  if (status && status !== 'COMPLETED') return status;
  return upper(check.conclusion || check.state || check.status);
}

function statusDescription(check) {
  return String(check?.description ?? '').trim();
}

function statusCreatedAt(check) {
  return check?.createdAt ?? check?.startedAt ?? check?.completedAt ?? '';
}

export function buildConflictFxStatusDescription({
  cohortId,
  cap,
  attempt,
  maxAttempts = CONFLICT_FX_MAX_ATTEMPTS,
  outcome,
  baseOid,
}) {
  const description = [
    CONFLICT_FX_RECEIPT_SCHEMA,
    `cohort=${
      String(cohortId ?? '')
        .replace(/[^A-Za-z0-9_.-]/gu, '')
        .slice(0, 32) || 'unknown'
    }`,
    `cap=${Math.max(0, Number.parseInt(cap, 10) || 0)}`,
    `try=${Math.max(0, Number.parseInt(attempt, 10) || 0)}/${Math.max(1, Number.parseInt(maxAttempts, 10) || CONFLICT_FX_MAX_ATTEMPTS)}`,
    `result=${String(outcome ?? 'unknown')
      .replace(/[^a-z_]/gu, '')
      .slice(0, 20)}`,
    `base=${String(baseOid ?? '')}`,
  ].join(' ');
  return description.slice(0, 140);
}

function isTrustedConflictFxActor(actor) {
  const login = String(actor?.login ?? '').toLowerCase();
  const type = String(actor?.type ?? '').toLowerCase();
  return (
    type === 'bot' &&
    CONFLICT_FX_TRUSTED_ACTORS.some(candidate => candidate === login)
  );
}

function isCanonicalActionsRunUrl(value) {
  return /^https:\/\/github\.com\/JovieInc\/Jovie\/actions\/runs\/\d+(?:[/?].*)?$/u.test(
    String(value ?? '')
  );
}

function conflictFxBaseRefFromTargetUrl(value) {
  try {
    return new URL(String(value ?? '')).searchParams.get('base_ref') ?? '';
  } catch {
    return '';
  }
}

export function parseConflictFxReceipt(check) {
  if (
    check?.__typename !== 'StatusContext' ||
    String(check?.context ?? '') !== CONFLICT_FX_STATUS_CONTEXT
  ) {
    return null;
  }
  const description = statusDescription(check);
  if (!description.startsWith(CONFLICT_FX_RECEIPT_SCHEMA)) return null;
  if (
    !isTrustedConflictFxActor(check?.creator) ||
    !isCanonicalActionsRunUrl(check?.targetUrl)
  ) {
    return null;
  }
  const fields = Object.fromEntries(
    description
      .split(/\s+/u)
      .slice(1)
      .map(part => part.split('=', 2))
      .filter(parts => parts.length === 2)
  );
  const attemptMatch = /^(\d+)\/(\d+)$/u.exec(
    fields.try ?? fields.attempt ?? ''
  );
  if (!attemptMatch) return null;
  const attempt = Number.parseInt(attemptMatch[1], 10);
  const maxAttempts = Number.parseInt(attemptMatch[2], 10);
  const cap = Number.parseInt(fields.cap ?? '', 10);
  const createdAt = statusCreatedAt(check);
  const validOutcomes = new Set(['pending', 'success', 'failed', 'exhausted']);
  const state = checkState(check);
  const outcome = fields.result ?? fields.outcome ?? '';
  const baseRefName = conflictFxBaseRefFromTargetUrl(check?.targetUrl);
  const outcomeMatchesState =
    (outcome === 'pending' && state === 'PENDING') ||
    (outcome === 'success' && state === 'SUCCESS') ||
    (['failed', 'exhausted'].includes(outcome) &&
      ['FAILURE', 'ERROR'].includes(state));
  if (
    !Number.isSafeInteger(attempt) ||
    !Number.isSafeInteger(maxAttempts) ||
    !Number.isSafeInteger(cap) ||
    attempt < 1 ||
    maxAttempts !== CONFLICT_FX_MAX_ATTEMPTS ||
    attempt > maxAttempts ||
    cap < 1 ||
    cap > CONFLICT_FX_COHORT_TIERS.at(-1) ||
    !/^[A-Za-z0-9_.-]{1,32}$/u.test(fields.cohort ?? '') ||
    !validOutcomes.has(outcome) ||
    !outcomeMatchesState ||
    !/^[0-9a-f]{40}$/u.test(fields.base ?? '') ||
    !baseRefName ||
    timeValue(createdAt) === 0
  ) {
    return null;
  }
  return {
    cohortId: fields.cohort ?? 'unknown',
    cap,
    attempt,
    maxAttempts,
    outcome,
    baseOid: fields.base ?? '',
    baseRefName,
    createdAt,
    state,
  };
}

export function latestConflictFxReceipt(pr) {
  return (
    (pr?.statusCheckRollup ?? [])
      .map(parseConflictFxReceipt)
      .filter(Boolean)
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0] ??
    null
  );
}

export function collectConflictFxCohorts(prs) {
  const latestByPrAndCohort = new Map();
  for (const pr of prs ?? []) {
    for (const check of pr.statusCheckRollup ?? []) {
      const receipt = parseConflictFxReceipt(check);
      if (!receipt) continue;
      const key = `${pr.number}:${receipt.cohortId}`;
      const prior = latestByPrAndCohort.get(key);
      if (!prior || timeValue(receipt.createdAt) > timeValue(prior.createdAt)) {
        latestByPrAndCohort.set(key, receipt);
      }
    }
  }

  const grouped = new Map();
  for (const receipt of latestByPrAndCohort.values()) {
    const cohort = grouped.get(receipt.cohortId) ?? {
      id: receipt.cohortId,
      cap: receipt.cap,
      attempted: 0,
      successes: 0,
      failures: 0,
      pending: 0,
      createdAt: receipt.createdAt,
    };
    cohort.cap = Math.max(cohort.cap, receipt.cap);
    if (timeValue(receipt.createdAt) > timeValue(cohort.createdAt)) {
      cohort.createdAt = receipt.createdAt;
    }
    if (receipt.outcome === 'success') {
      cohort.attempted += 1;
      cohort.successes += 1;
    } else if (
      receipt.outcome === 'exhausted' ||
      receipt.outcome === 'failed'
    ) {
      cohort.attempted += 1;
      cohort.failures += 1;
    } else {
      cohort.pending += 1;
    }
    grouped.set(receipt.cohortId, cohort);
  }

  return [...grouped.values()]
    .map(cohort => ({
      ...cohort,
      durable: false,
      successRate:
        cohort.attempted > 0 ? cohort.successes / cohort.attempted : 0,
      clean:
        cohort.attempted > 0 && cohort.failures === 0 && cohort.pending === 0,
    }))
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

function hasConflictFxLatencyDegradation(cohort) {
  const p95 = Math.max(0, Number(cohort?.p95CiLatencyMs ?? 0));
  const baseline = Math.max(0, Number(cohort?.baselineP95CiLatencyMs ?? 0));
  return (
    p95 > CONFLICT_FX_MAX_HEALTHY_CI_LATENCY_MS ||
    (baseline > 0 &&
      p95 > baseline * CONFLICT_FX_MAX_CI_LATENCY_REGRESSION_RATIO)
  );
}

export function buildConflictFxCohortMarker(receipt) {
  const payload = {
    schema: CONFLICT_FX_COHORT_SCHEMA,
    id: String(receipt?.id ?? ''),
    cap: Number(receipt?.cap ?? 0),
    attempted: Number(receipt?.attempted ?? 0),
    successes: Number(receipt?.successes ?? 0),
    failures: Number(receipt?.failures ?? 0),
    pending: Number(receipt?.pending ?? 0),
    staleHeadSkips: Number(receipt?.staleHeadSkips ?? 0),
    staleHeadSkipRate: Number(receipt?.staleHeadSkipRate ?? 0),
    p95CiLatencyMs: Number(receipt?.p95CiLatencyMs ?? 0),
    baselineP95CiLatencyMs: Number(receipt?.baselineP95CiLatencyMs ?? 0),
    runnerCapacity: Number(receipt?.runnerCapacity ?? 0),
    activeCi: Number(receipt?.activeCi ?? 0),
    queuedCi: Number(receipt?.queuedCi ?? 0),
    backlog: Number(receipt?.backlog ?? 0),
    clean: receipt?.clean === true,
    createdAt: String(receipt?.createdAt ?? ''),
    runUrl: String(receipt?.runUrl ?? ''),
  };
  return `<!-- ${CONFLICT_FX_COHORT_MARKER_PREFIX}${Buffer.from(
    JSON.stringify(payload)
  ).toString('base64url')} -->`;
}

export function parseConflictFxCohortComments(comments = []) {
  const receipts = [];
  const marker = new RegExp(
    `<!--\\s*${CONFLICT_FX_COHORT_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}([A-Za-z0-9_-]+)\\s*-->`,
    'gu'
  );
  for (const comment of comments) {
    if (
      typeof comment === 'string' ||
      !isTrustedConflictFxActor(comment?.user) ||
      !/^https:\/\/github\.com\/JovieInc\/Jovie\/issues\/comments\/\d+$/u.test(
        String(comment?.html_url ?? '')
      )
    ) {
      continue;
    }
    const body = String(comment?.body ?? comment ?? '');
    for (const match of body.matchAll(marker)) {
      try {
        const receipt = JSON.parse(
          Buffer.from(match[1], 'base64url').toString('utf8')
        );
        const integerFields = [
          'cap',
          'attempted',
          'successes',
          'failures',
          'pending',
          'staleHeadSkips',
          'p95CiLatencyMs',
          'baselineP95CiLatencyMs',
          'runnerCapacity',
          'activeCi',
          'queuedCi',
          'backlog',
        ];
        if (
          receipt?.schema === CONFLICT_FX_COHORT_SCHEMA &&
          /^[A-Za-z0-9_.-]{1,64}$/u.test(receipt.id ?? '') &&
          integerFields.every(
            field => Number.isSafeInteger(receipt[field]) && receipt[field] >= 0
          ) &&
          CONFLICT_FX_COHORT_TIERS.includes(receipt.cap) &&
          receipt.attempted === receipt.successes + receipt.failures &&
          receipt.successes <= receipt.attempted &&
          receipt.pending <= receipt.cap &&
          receipt.staleHeadSkips <= receipt.attempted &&
          Number.isFinite(receipt.staleHeadSkipRate) &&
          receipt.staleHeadSkipRate >= 0 &&
          receipt.staleHeadSkipRate <= 1 &&
          timeValue(receipt.createdAt) > 0 &&
          isCanonicalActionsRunUrl(receipt.runUrl) &&
          receipt.clean ===
            (receipt.attempted > 0 &&
              receipt.failures === 0 &&
              receipt.pending === 0 &&
              receipt.staleHeadSkips === 0 &&
              !hasConflictFxLatencyDegradation(receipt))
        ) {
          receipts.push({ ...receipt, durable: true });
        }
      } catch {
        // Ignore malformed external comments; only typed receipts influence capacity.
      }
    }
  }
  const byId = new Map();
  for (const receipt of receipts) {
    const prior = byId.get(receipt.id);
    if (!prior || timeValue(receipt.createdAt) > timeValue(prior.createdAt)) {
      byId.set(receipt.id, receipt);
    }
  }
  return [...byId.values()].sort(
    (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt)
  );
}

export function mergeConflictFxCohortHistory(...histories) {
  const byId = new Map();
  for (const cohort of histories.flat()) {
    if (!cohort?.id) continue;
    const prior = byId.get(cohort.id);
    if (!prior || timeValue(cohort.createdAt) > timeValue(prior.createdAt)) {
      byId.set(cohort.id, cohort);
    }
  }
  return [...byId.values()].sort(
    (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt)
  );
}

export function computeAdaptiveConcurrency({
  runnerCapacity = 2,
  activeCi = 0,
  queuedCi = 0,
  backlog = 0,
  recentCohorts = [],
  now = Date.now(),
} = {}) {
  const capacity = Math.max(0, Number.parseInt(runnerCapacity, 10) || 0);
  const active = Math.max(0, Number.parseInt(activeCi, 10) || 0);
  const queued = Math.max(0, Number.parseInt(queuedCi, 10) || 0);
  const openBacklog = Math.max(0, Number.parseInt(backlog, 10) || 0);
  const availableRunners = Math.max(0, capacity - active - queued);
  const saturation = capacity > 0 ? (active + queued) / capacity : 1;
  const completed = recentCohorts
    .filter(
      cohort =>
        cohort.durable !== false && cohort.attempted > 0 && cohort.pending === 0
    )
    .slice(0, 4);
  const pendingRemediations = recentCohorts.reduce((total, cohort) => {
    const ageMs = now - timeValue(cohort.createdAt);
    const claimIsFresh = ageMs >= 0 && ageMs < CONFLICT_FX_CLAIM_TTL_MS;
    return (
      total + (claimIsFresh ? Math.max(0, Number(cohort.pending ?? 0)) : 0)
    );
  }, 0);
  const latest = completed[0];
  const latestSuccessRate =
    latest?.attempted > 0 ? latest.successes / latest.attempted : null;
  const twoCleanTenCohorts = completed.slice(0, 2);
  const canRampToForty =
    twoCleanTenCohorts.length === 2 &&
    twoCleanTenCohorts.every(
      cohort =>
        cohort.clean === true &&
        cohort.cap >= CONFLICT_FX_COHORT_TIERS[1] &&
        cohort.attempted >= CONFLICT_FX_COHORT_TIERS[1]
    );

  let tier = CONFLICT_FX_COHORT_TIERS[0];
  let reason = 'start with the two-PR canary cohort';
  if (
    latest?.clean === true &&
    latest.cap >= CONFLICT_FX_COHORT_TIERS[0] &&
    latest.attempted >= CONFLICT_FX_COHORT_TIERS[0]
  ) {
    tier = CONFLICT_FX_COHORT_TIERS[1];
    reason = 'the latest canary cohort completed cleanly';
  }
  if (canRampToForty) {
    tier = CONFLICT_FX_COHORT_TIERS[2];
    reason = 'two consecutive ten-PR cohorts completed cleanly';
  }

  const recentFailure = completed
    .slice(0, 2)
    .some(
      cohort =>
        cohort.failures > 0 ||
        cohort.clean !== true ||
        cohort.staleHeadSkips > 0 ||
        cohort.staleHeadSkipRate > 0 ||
        hasConflictFxLatencyDegradation(cohort)
    );
  if (recentFailure || saturation >= 0.8) {
    tier = CONFLICT_FX_COHORT_TIERS[0];
    reason = recentFailure
      ? 'recent remediation failure, stale-head skip, or CI latency degradation forces canary backoff'
      : 'CI runner saturation forces canary backoff';
  } else if (saturation >= 0.5 || queued > Math.max(2, capacity * 0.1)) {
    tier = Math.min(tier, CONFLICT_FX_COHORT_TIERS[1]);
    reason = 'CI queue pressure caps remediation at ten';
  }

  const cap = Math.min(
    Math.max(0, tier - pendingRemediations),
    availableRunners,
    openBacklog
  );
  return {
    cap,
    tier,
    runnerCapacity: capacity,
    activeCi: active,
    queuedCi: queued,
    availableRunners,
    backlog: openBacklog,
    saturation,
    recentSuccessRate: latestSuccessRate,
    pendingRemediations,
    reason:
      cap === 0 && pendingRemediations >= tier
        ? 'the current bounded cohort is still in flight'
        : cap === 0 && openBacklog > 0
          ? 'no GitHub-hosted runner capacity is currently available'
          : reason,
  };
}

export function buildConflictFxPrompt({
  repository,
  prNumber,
  headOid,
  baseOid,
  conflictFiles = [],
  attempt,
  maxAttempts = CONFLICT_FX_MAX_ATTEMPTS,
}) {
  return [
    'Resolve the already-started merge of current base into this exact same-repository pull-request head.',
    `Repository: ${repository}`,
    `PR: #${prNumber}`,
    `Exact source head: ${headOid}`,
    `Exact base head: ${baseOid}`,
    `Bounded attempt: ${attempt}/${maxAttempts}`,
    `Conflicting files: ${conflictFiles.join(', ') || 'unknown'}`,
    "Resolve only the listed unmerged files. Preserve both sides when compatible and keep the PR's original intent.",
    'Do not commit, push, open or close a PR, edit workflow/controller policy, weaken tests, or add a hold label.',
    'Human taste or steering is never a merge gate: preserve the already-shipping behavior and leave any optional subjective change for a separate follow-up PR.',
    'Finish with no unmerged paths and run the narrowest relevant deterministic checks. The trusted writer independently verifies and performs one non-force push after an exact-head reread.',
  ].join('\n');
}

export function buildSteeringExceptionReceipt({
  prNumber,
  headOid,
  baseOid,
  attempts = CONFLICT_FX_MAX_ATTEMPTS,
  conflictFiles = [],
  competingChanges = [],
  recommendedAction = 'split the objective shipping change from the subjective decision and open the latter as a separate follow-up PR',
}) {
  return {
    schema: CONFLICT_STEERING_EXCEPTION_SCHEMA,
    leaseTerminal: true,
    closedLoopTerminal: true,
    pr: prNumber,
    headOid,
    baseOid,
    attempts,
    conflictFiles,
    competingChanges,
    recommendedAction,
    blocksShippingPr: false,
    mergeBlockedByConflict: true,
    humanDecisionRequired: false,
    nextOwner: 'new-exact-pair-or-separate-follow-up',
    nextAction:
      'a new exact head/base pair starts a fresh bounded lease automatically; any subjective choice belongs in a separate independently shippable follow-up',
    mergeBlockingLabels: [],
    steeringTiming: 'before_pr_or_separate_follow_up_pr',
  };
}

export function buildPermissionExceptionReceipt({
  prNumber,
  headOid,
  baseOid,
}) {
  return {
    schema: CONFLICT_PERMISSION_EXCEPTION_SCHEMA,
    leaseTerminal: true,
    closedLoopTerminal: true,
    pr: prNumber,
    headOid,
    baseOid,
    category: 'untrusted-or-fork-head',
    humanDecisionRequired: false,
    nextOwner: 'trusted-writer-intake',
    nextAction:
      'mirror the objective change onto a trusted same-repository branch before remediation',
    mergeBlockingLabels: [],
  };
}

function isRunningCheck(check) {
  return RUNNING_STATES.has(checkState(check));
}

function isTerminalFailure(check) {
  return TERMINAL_FAILURES.has(checkState(check));
}

function isSuccessLike(check) {
  return SUCCESS_STATES.has(checkState(check));
}

function newestCheck(checks) {
  return [...checks].sort((a, b) => checkTimestamp(b) - checkTimestamp(a))[0];
}

export function summarizeChecks(
  statusCheckRollup = [],
  requiredChecks = DEFAULT_REQUIRED_CHECKS
) {
  const requiredByKey = new Map(
    requiredChecks.map(name => [canonicalRequiredKey(name), name])
  );
  const required = new Map(
    requiredChecks.map(name => [
      canonicalRequiredKey(name),
      { name, checks: [] },
    ])
  );
  const running = [];
  const failing = [];

  for (const check of statusCheckRollup ?? []) {
    const name = checkName(check);
    const key = canonicalRequiredKey(name);
    if (name === CONFLICT_FX_STATUS_CONTEXT) continue;
    if (isRunningCheck(check)) {
      running.push({ name, state: checkState(check) });
    }
    if (isTerminalFailure(check)) {
      failing.push({ name, state: checkState(check) });
    }
    if (requiredByKey.has(key)) {
      required.get(key).checks.push(check);
    }
  }

  const requiredResults = [...required.values()].map(entry => {
    const latest = newestCheck(entry.checks);
    const successful = entry.checks.some(isSuccessLike);
    const active = entry.checks.find(isRunningCheck);
    const terminalFailure = newestCheck(entry.checks.filter(isTerminalFailure));
    let state = 'MISSING';
    if (active) state = checkState(active);
    else if (terminalFailure && !successful)
      state = checkState(terminalFailure);
    else if (successful) state = 'SUCCESS';
    else if (latest) state = checkState(latest);

    return {
      name: entry.name,
      state,
      latestName: latest ? checkName(latest) : '',
      count: entry.checks.length,
    };
  });

  return {
    running,
    failing,
    required: requiredResults,
    runningRequired: requiredResults.filter(result =>
      RUNNING_STATES.has(result.state)
    ),
    failingRequired: requiredResults.filter(result =>
      TERMINAL_FAILURES.has(result.state)
    ),
    missingRequired: requiredResults.filter(
      result => result.state === 'MISSING'
    ),
    nonGreenRequired: requiredResults.filter(
      result => result.state !== 'SUCCESS' && !RUNNING_STATES.has(result.state)
    ),
  };
}

export function isInternalPr(pr, repoOwner = 'JovieInc') {
  const owner = pr.headRepositoryOwner?.login ?? '';
  return (
    pr.isCrossRepository !== true &&
    owner.toLowerCase() === repoOwner.toLowerCase()
  );
}

export function isConflictPr(pr) {
  return pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY';
}

export function classifyPr(
  pr,
  { requiredChecks = DEFAULT_REQUIRED_CHECKS, repoOwner = 'JovieInc' } = {}
) {
  const checks = summarizeChecks(pr.statusCheckRollup ?? [], requiredChecks);
  const labels = labelNames(pr.labels);
  const internal = isInternalPr(pr, repoOwner);
  const mergeStateStatus = pr.mergeStateStatus ?? 'UNKNOWN';
  const mergeable = pr.mergeable ?? 'UNKNOWN';
  const reasons = [];
  let state = 'UNKNOWN';

  if (isConflictPr(pr)) {
    state = 'DIRTY';
    reasons.push(
      `mergeable=${mergeable}`,
      `mergeStateStatus=${mergeStateStatus}`
    );
  } else if (mergeStateStatus === 'UNSTABLE' || checks.running.length > 0) {
    state = 'UNSTABLE';
    const runningNames = checks.running.slice(0, 4).map(check => check.name);
    reasons.push(
      runningNames.length > 0
        ? `CI in flight: ${runningNames.join(', ')}`
        : `mergeStateStatus=${mergeStateStatus}`
    );
  } else if (
    mergeStateStatus === 'BLOCKED' ||
    checks.failingRequired.length > 0 ||
    checks.missingRequired.length > 0
  ) {
    state = 'BLOCKED';
    const blocked = checks.nonGreenRequired.map(
      check => `${check.name}:${check.state}`
    );
    reasons.push(
      blocked.length > 0
        ? `required checks not green: ${blocked.join(', ')}`
        : `mergeStateStatus=${mergeStateStatus}`
    );
  } else if (mergeStateStatus === 'BEHIND' && mergeable === 'MERGEABLE') {
    state = 'BEHIND';
    reasons.push('base moved and GitHub reports branch is mergeable');
  } else if (mergeable === 'MERGEABLE') {
    state = 'MERGEABLE';
    reasons.push(`mergeStateStatus=${mergeStateStatus}`);
  } else {
    reasons.push(
      `mergeable=${mergeable}`,
      `mergeStateStatus=${mergeStateStatus}`
    );
  }

  if (pr.isDraft) reasons.push('draft PR');
  if (!internal) reasons.push('fork or cross-repository head');

  return {
    number: pr.number,
    state,
    action: '',
    reason: reasons.filter(Boolean).join('; '),
    internal,
    labels,
    checks,
    pr,
  };
}

function diffSize(pr) {
  return (
    Number(pr.changedFiles ?? 0) * 100_000 +
    Number(pr.additions ?? 0) +
    Number(pr.deletions ?? 0)
  );
}

function stableCompare(a, b) {
  const base = String(a.baseRefName ?? '').localeCompare(
    String(b.baseRefName ?? '')
  );
  if (base !== 0) return base;
  const size = diffSize(a) - diffSize(b);
  if (size !== 0) return size;
  const created = timeValue(a.createdAt) - timeValue(b.createdAt);
  if (created !== 0) return created;
  return Number(a.number ?? 0) - Number(b.number ?? 0);
}

export function orderPrsDependencyAware(prs) {
  const byHead = new Map();
  for (const pr of prs) {
    if (pr.headRefName) byHead.set(pr.headRefName, pr);
  }

  const children = new Map(prs.map(pr => [pr.number, []]));
  const indegree = new Map(prs.map(pr => [pr.number, 0]));
  for (const pr of prs) {
    const parent = byHead.get(pr.baseRefName);
    if (parent && parent.number !== pr.number) {
      children.get(parent.number).push(pr);
      indegree.set(pr.number, indegree.get(pr.number) + 1);
    }
  }

  const ready = prs
    .filter(pr => indegree.get(pr.number) === 0)
    .sort(stableCompare);
  const ordered = [];
  while (ready.length > 0) {
    const next = ready.shift();
    ordered.push(next);
    for (const child of children.get(next.number).sort(stableCompare)) {
      indegree.set(child.number, indegree.get(child.number) - 1);
      if (indegree.get(child.number) === 0) {
        ready.push(child);
        ready.sort(stableCompare);
      }
    }
  }

  if (ordered.length !== prs.length) {
    const seen = new Set(ordered.map(pr => pr.number));
    ordered.push(...prs.filter(pr => !seen.has(pr.number)).sort(stableCompare));
  }

  return ordered;
}

export function decideAction(classification, context = {}) {
  const {
    blockedLabel = DEFAULT_BLOCKED_LABEL,
    availableCiSlots = 0,
    plannedCiTriggers = 0,
    availableRebaseSlots = availableCiSlots,
    availableFxSlots = availableCiSlots,
    plannedRebaseTriggers = plannedCiTriggers,
    plannedFxTriggers = plannedCiTriggers,
    now = Date.now(),
  } = context;
  const pr = classification.pr;

  if (pr.isInMergeQueue === true) {
    return {
      action: 'skip_native_merge_queue',
      triggersCi: false,
      reason:
        'native merge queue owns this PR; never update its head or dequeue it',
    };
  }

  if (pr.isDraft && !['DIRTY', 'BEHIND'].includes(classification.state)) {
    return {
      action: 'skip_draft',
      triggersCi: false,
      reason:
        'draft PR is not hard-blocked; its owning agent retains readiness and auto-merge responsibility',
    };
  }

  if (classification.state === 'UNSTABLE') {
    return {
      action: 'wait_ci',
      triggersCi: false,
      reason: 'CI is already in flight; pushing now would cancel the run',
    };
  }

  if (classification.state === 'BLOCKED') {
    return {
      action: 'flag_blocked_checks',
      label: blockedLabel,
      triggersCi: false,
      reason:
        'required checks are failing or absent; do not rebase and waste CI',
    };
  }

  if (classification.state === 'MERGEABLE') {
    return {
      action: 'noop_clean',
      triggersCi: false,
      reason: 'PR is mergeable/clean enough; leave it alone',
    };
  }

  if (classification.state === 'BEHIND') {
    if (!classification.internal) {
      return {
        action: 'skip_fork',
        triggersCi: false,
        reason:
          'fork/cross-repo PR: do not mutate branch with internal update flow',
      };
    }
    if (plannedRebaseTriggers >= availableRebaseSlots) {
      return {
        action: 'wait_capacity',
        triggersCi: false,
        reason: 'Neon/CI re-trigger capacity is full for this run',
      };
    }
    return {
      action: 'request_github_rebase',
      triggersCi: true,
      reason:
        'mergeable but behind; request an exact-head GitHub Update Branch rebase',
    };
  }

  if (classification.state === 'DIRTY') {
    if (classification.checks.running.length > 0) {
      return {
        action: 'wait_ci',
        triggersCi: false,
        reason:
          'conflicted, but CI is in flight; wait to avoid cancellation churn',
      };
    }
    if (!classification.internal) {
      return {
        action: 'emit_permission_exception',
        triggersCi: false,
        reason:
          'fork/cross-repo conflict is outside the trusted writer boundary; emit a structured permission exception instead of a passive human hold',
      };
    }

    const receipt = latestConflictFxReceipt(pr);
    const baseMatches =
      receipt?.baseOid &&
      String(pr.baseRefOid ?? '') === receipt.baseOid &&
      String(pr.baseRefName ?? '') === receipt.baseRefName;
    const currentReceipt = baseMatches ? receipt : null;
    const attempt = currentReceipt?.attempt ?? 0;
    const receiptAgeMs = currentReceipt
      ? now - timeValue(currentReceipt.createdAt)
      : Number.POSITIVE_INFINITY;
    const claimIsLive =
      currentReceipt?.outcome === 'pending' &&
      receiptAgeMs >= 0 &&
      receiptAgeMs < CONFLICT_FX_CLAIM_TTL_MS;

    if (claimIsLive) {
      return {
        action: 'wait_conflict_fx',
        triggersCi: false,
        reason: `bounded FX attempt ${attempt}/${CONFLICT_FX_MAX_ATTEMPTS} is live`,
      };
    }
    if (
      currentReceipt?.outcome === 'exhausted' ||
      attempt >= CONFLICT_FX_MAX_ATTEMPTS
    ) {
      return {
        action: 'emit_steering_exception',
        triggersCi: false,
        attempt,
        reason:
          'bounded smarter-model attempts are exhausted; emit a structured steering exception without adding a merge-blocking human label',
      };
    }
    if (plannedFxTriggers >= availableFxSlots) {
      return {
        action: 'wait_capacity',
        triggersCi: false,
        reason: 'adaptive GitHub-hosted remediation capacity is full',
      };
    }
    return {
      action: 'escalate_conflict_fx',
      triggersCi: true,
      attempt: attempt + 1,
      maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
      model: CONFLICT_FX_MODEL,
      reason:
        'GitHub reports a true same-repository conflict; escalate to bounded smarter-model FX and deliver only after an exact-head reread',
    };
  }

  return {
    action: 'skip_unknown',
    triggersCi: false,
    reason: 'mergeability state is unknown; no mutation',
  };
}

export function buildPlan(
  prs,
  {
    maxConcurrent = 40,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    repoOwner = 'JovieInc',
    blockedLabel = DEFAULT_BLOCKED_LABEL,
    runnerCapacity = 2,
    activeCi = 0,
    queuedCi = 0,
    cohortId = 'local',
    cohortHistory = [],
    now = Date.now(),
  } = {}
) {
  const orderedPrs = orderPrsDependencyAware(prs);
  const classifications = orderedPrs.map(pr =>
    classifyPr(pr, { requiredChecks, repoOwner })
  );
  const currentCiInFlight = classifications.filter(
    item => item.state === 'UNSTABLE'
  ).length;
  const remediationBacklog = classifications.filter(
    item => ['DIRTY', 'BEHIND'].includes(item.state) && item.internal
  ).length;
  const recentCohorts = mergeConflictFxCohortHistory(
    cohortHistory,
    collectConflictFxCohorts(prs)
  );
  const adaptive = computeAdaptiveConcurrency({
    runnerCapacity,
    activeCi,
    queuedCi,
    backlog: remediationBacklog,
    recentCohorts,
    now,
  });
  const requestedLimit = Math.max(1, Number.parseInt(maxConcurrent, 10) || 1);
  const availableRemediationSlots = Math.max(
    0,
    Math.min(adaptive.cap, requestedLimit) - currentCiInFlight
  );
  let plannedRebaseTriggers = 0;
  let plannedFxTriggers = 0;

  const items = classifications.map(classification => {
    const decision = decideAction(classification, {
      blockedLabel,
      availableRebaseSlots: availableRemediationSlots,
      availableFxSlots: availableRemediationSlots,
      plannedRebaseTriggers: plannedRebaseTriggers + plannedFxTriggers,
      plannedFxTriggers: plannedRebaseTriggers + plannedFxTriggers,
      now,
    });
    if (decision.action === 'request_github_rebase') {
      plannedRebaseTriggers += 1;
    }
    if (decision.action === 'escalate_conflict_fx') {
      plannedFxTriggers += 1;
    }
    return {
      ...classification,
      action: decision.action,
      actionReason: decision.reason,
      label: decision.label,
      triggersCi: decision.triggersCi,
      attempt: decision.attempt,
      maxAttempts: decision.maxAttempts,
      model: decision.model,
    };
  });

  const fxMatrix = items
    .filter(item => item.action === 'escalate_conflict_fx')
    .map(item => ({
      prNumber: item.number,
      baseRefName: item.pr.baseRefName,
      baseRefOid: item.pr.baseRefOid,
      headRefName: item.pr.headRefName,
      headRefOid: item.pr.headRefOid,
      attempt: item.attempt,
      maxAttempts: item.maxAttempts,
      model: item.model,
      cohortId,
      adaptiveCap: availableRemediationSlots,
      autoMergeEnabled: Boolean(item.pr.autoMergeRequest),
      draftState: item.pr.isDraft === true,
    }));

  const exceptionMatrix = items
    .filter(item =>
      ['emit_steering_exception', 'emit_permission_exception'].includes(
        item.action
      )
    )
    .map(item => ({
      prNumber: item.number,
      baseRefName: item.pr.baseRefName,
      baseRefOid: item.pr.baseRefOid,
      headRefName: item.pr.headRefName,
      headRefOid: item.pr.headRefOid,
      attempt: item.attempt ?? 0,
      maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
      exceptionType:
        item.action === 'emit_permission_exception'
          ? 'permission'
          : 'exhausted',
      cohortId,
      adaptiveCap: availableRemediationSlots,
      autoMergeEnabled: Boolean(item.pr.autoMergeRequest),
      draftState: item.pr.isDraft === true,
    }));

  return {
    items,
    fxMatrix,
    exceptionMatrix,
    summary: summarizePlan(items),
    capacity: {
      maxConcurrent,
      currentCiInFlight,
      availableCiSlots: availableRemediationSlots,
      availableRebaseSlots: availableRemediationSlots,
      plannedCiTriggers: plannedRebaseTriggers + plannedFxTriggers,
      plannedRebaseTriggers,
      plannedFxTriggers,
      adaptive,
      recentCohorts,
    },
  };
}

export function summarizePlan(items) {
  const byState = {};
  const byAction = {};
  for (const item of items) {
    byState[item.state] = (byState[item.state] ?? 0) + 1;
    byAction[item.action] = (byAction[item.action] ?? 0) + 1;
  }
  return {
    total: items.length,
    byState,
    byAction,
    conflictFxCandidates: items
      .filter(item => item.action === 'escalate_conflict_fx')
      .map(item => item.number),
    steeringExceptions: items
      .filter(item => item.action === 'emit_steering_exception')
      .map(item => item.number),
  };
}

export function formatPlan(plan, { dryRun = true } = {}) {
  const lines = [
    `PR freshness plan (dryRun=${dryRun}, requestedMax=${plan.capacity.maxConcurrent}, adaptiveCap=${plan.capacity.availableCiSlots}, currentCiInFlight=${plan.capacity.currentCiInFlight})`,
    `Summary states: ${JSON.stringify(plan.summary.byState)}`,
    `Summary actions: ${JSON.stringify(plan.summary.byAction)}`,
    'Order:',
  ];

  for (const item of plan.items) {
    lines.push(
      `  #${item.number} ${item.state} -> ${item.action} :: ${item.actionReason} (${item.pr.title ?? ''})`
    );
  }

  const conflictFx = plan.summary.conflictFxCandidates;
  lines.push(
    `conflict FX candidates: ${conflictFx.length > 0 ? conflictFx.map(n => `#${n}`).join(', ') : 'none'}`
  );
  lines.push(`adaptive capacity: ${JSON.stringify(plan.capacity.adaptive)}`);
  return `${lines.join('\n')}\n`;
}
