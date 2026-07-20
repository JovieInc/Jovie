export const DEFAULT_REQUIRED_CHECKS = Object.freeze([
  'CI / PR Ready',
  'CI / Migration Guard',
  'Fork PR Gate',
]);

export const DEFAULT_MANUAL_REBASE_LABEL = 'needs-manual-rebase';
export const DEFAULT_BLOCKED_LABEL = 'needs-ci-fix';

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

function actionTriggersCi(action) {
  return action === 'request_github_rebase';
}

export function decideAction(classification, context = {}) {
  const {
    manualRebaseLabel = DEFAULT_MANUAL_REBASE_LABEL,
    blockedLabel = DEFAULT_BLOCKED_LABEL,
    availableCiSlots = 0,
    plannedCiTriggers = 0,
  } = context;
  const pr = classification.pr;

  if (pr.isDraft) {
    return {
      action: 'skip_draft',
      triggersCi: false,
      reason: 'draft PRs are not freshness-managed',
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
    if (plannedCiTriggers >= availableCiSlots) {
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
        action: 'label_needs_manual_rebase',
        label: manualRebaseLabel,
        triggersCi: false,
        reason: 'fork/cross-repo conflict requires human-owned rebase',
      };
    }
    return {
      action: 'label_needs_manual_rebase',
      label: manualRebaseLabel,
      triggersCi: false,
      reason:
        'GitHub reports a true conflict; do not merge main or force-push the PR branch',
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
    maxConcurrent = 2,
    requiredChecks = DEFAULT_REQUIRED_CHECKS,
    repoOwner = 'JovieInc',
    manualRebaseLabel = DEFAULT_MANUAL_REBASE_LABEL,
    blockedLabel = DEFAULT_BLOCKED_LABEL,
  } = {}
) {
  const orderedPrs = orderPrsDependencyAware(prs);
  const classifications = orderedPrs.map(pr =>
    classifyPr(pr, { requiredChecks, repoOwner })
  );
  const currentCiInFlight = classifications.filter(
    item => item.state === 'UNSTABLE'
  ).length;
  const availableCiSlots = Math.max(0, maxConcurrent - currentCiInFlight);
  let plannedCiTriggers = 0;

  const items = classifications.map(classification => {
    const decision = decideAction(classification, {
      manualRebaseLabel,
      blockedLabel,
      availableCiSlots,
      plannedCiTriggers,
    });
    if (actionTriggersCi(decision.action)) plannedCiTriggers += 1;
    return {
      ...classification,
      action: decision.action,
      actionReason: decision.reason,
      label: decision.label,
      triggersCi: decision.triggersCi,
    };
  });

  return {
    items,
    summary: summarizePlan(items),
    capacity: {
      maxConcurrent,
      currentCiInFlight,
      availableCiSlots,
      plannedCiTriggers,
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
    manualRebaseCandidates: items
      .filter(item => item.action === 'label_needs_manual_rebase')
      .map(item => item.number),
  };
}

export function formatPlan(plan, { dryRun = true } = {}) {
  const lines = [
    `PR freshness plan (dryRun=${dryRun}, maxConcurrent=${plan.capacity.maxConcurrent}, currentCiInFlight=${plan.capacity.currentCiInFlight}, newTriggerSlots=${plan.capacity.availableCiSlots})`,
    `Summary states: ${JSON.stringify(plan.summary.byState)}`,
    `Summary actions: ${JSON.stringify(plan.summary.byAction)}`,
    'Order:',
  ];

  for (const item of plan.items) {
    lines.push(
      `  #${item.number} ${item.state} -> ${item.action} :: ${item.actionReason} (${item.pr.title ?? ''})`
    );
  }

  const manual = plan.summary.manualRebaseCandidates;
  lines.push(
    `needs-manual-rebase candidates: ${manual.length > 0 ? manual.map(n => `#${n}`).join(', ') : 'none'}`
  );
  return `${lines.join('\n')}\n`;
}
