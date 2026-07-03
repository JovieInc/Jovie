import { isAgentBranch, isHardGated } from './agent-branch.mjs';
import { extractTerminalFailureNames } from './ci-check-failures.mjs';

export const DRAIN_REBASE_LABEL = 'drain-rebased';
export const DEFAULT_REBASE_COOLDOWN_HOURS = 4;
export const DEFAULT_MAX_REBASES_PER_RUN = 3;

const OPT_OUT_LABELS = new Set([
  'needs-human-taste',
  'needs-human',
  'hold',
  'gated',
  'fast',
  'needs-conflict-resolution',
  'needs-manual-rebase',
]);

function labelNames(labels = []) {
  return labels.map(label =>
    typeof label === 'string' ? label : label?.name
  );
}

function hoursSince(isoTimestamp) {
  const parsed = Date.parse(isoTimestamp ?? '');
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed) / (60 * 60 * 1000);
}

export function isBehindBase(pr) {
  const status = String(pr.mergeStateStatus ?? '').toUpperCase();
  if (status.includes('BEHIND')) return true;
  const behindBy = Number(pr.commitsBehindBase ?? pr.behindBy ?? NaN);
  return Number.isFinite(behindBy) && behindBy > 0;
}

export function hasRecentDrainRebase(pr, cooldownHours = DEFAULT_REBASE_COOLDOWN_HOURS) {
  const labels = labelNames(pr.labels);
  if (!labels.includes(DRAIN_REBASE_LABEL)) return false;
  return hoursSince(pr.updatedAt) < cooldownHours;
}

export function classifyRemediationCandidate(
  pr,
  {
    requiredFailures = [],
    cooldownHours = DEFAULT_REBASE_COOLDOWN_HOURS,
    repoOwner = 'JovieInc',
  } = {}
) {
  const labels = labelNames(pr.labels);
  const failures =
    requiredFailures.length > 0
      ? requiredFailures
      : extractTerminalFailureNames(pr.statusCheckRollup ?? []);

  if (pr.isDraft) {
    return { eligible: false, reason: 'draft PR' };
  }
  if (!isAgentBranch(pr.headRefName)) {
    return { eligible: false, reason: 'not an agent-owned branch' };
  }
  if (isHardGated(labels)) {
    return { eligible: false, reason: 'hard-gated label present' };
  }
  if (labels.some(name => OPT_OUT_LABELS.has(name))) {
    return { eligible: false, reason: 'opt-out label present' };
  }
  if (pr.mergeable !== 'MERGEABLE') {
    return { eligible: false, reason: `mergeable=${pr.mergeable ?? 'UNKNOWN'}` };
  }
  if (failures.length === 0) {
    return { eligible: false, reason: 'no terminal required-check failures' };
  }
  if (!isBehindBase(pr)) {
    return {
      eligible: false,
      reason:
        'branch is current with base; failing checks are likely PR-local, not stale main CI',
    };
  }
  if (pr.isCrossRepository === true) {
    return { eligible: false, reason: 'cross-repository head' };
  }
  const owner = pr.headRepositoryOwner?.login ?? '';
  if (owner && owner.toLowerCase() !== repoOwner.toLowerCase()) {
    return { eligible: false, reason: 'fork or external head repository' };
  }
  if (hasRecentDrainRebase(pr, cooldownHours)) {
    return {
      eligible: false,
      reason: `rebased within the last ${cooldownHours}h (label ${DRAIN_REBASE_LABEL})`,
    };
  }

  return {
    eligible: true,
    reason: `behind base with stale required failures: ${failures.join(', ')}`,
    failures,
  };
}

export function buildRemediationPlan(
  prs,
  {
    maxRebases = DEFAULT_MAX_REBASES_PER_RUN,
    cooldownHours = DEFAULT_REBASE_COOLDOWN_HOURS,
    repoOwner = 'JovieInc',
    requiredFailuresByPr = new Map(),
  } = {}
) {
  const candidates = [];
  const skipped = [];

  for (const pr of prs) {
    const requiredFailures = requiredFailuresByPr.get(pr.number) ?? [];
    const verdict = classifyRemediationCandidate(pr, {
      requiredFailures,
      cooldownHours,
      repoOwner,
    });
    const item = {
      number: pr.number,
      title: pr.title,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      mergeStateStatus: pr.mergeStateStatus,
      ...verdict,
    };
    if (verdict.eligible) candidates.push(item);
    else skipped.push(item);
  }

  candidates.sort(
    (a, b) =>
      Number(a.number) - Number(b.number) ||
      String(a.headRefName).localeCompare(String(b.headRefName))
  );

  return {
    candidates: candidates.slice(0, maxRebases),
    skipped,
    deferred: candidates.slice(maxRebases),
    summary: {
      totalInspected: prs.length,
      eligible: candidates.length,
      planned: Math.min(candidates.length, maxRebases),
      skipped: skipped.length,
      deferred: Math.max(0, candidates.length - maxRebases),
    },
  };
}

export function formatRemediationPlan(plan, { dryRun = true } = {}) {
  const lines = [
    `Drain remediation plan (dryRun=${dryRun}, planned=${plan.summary.planned}/${plan.summary.eligible})`,
    `Skipped: ${plan.summary.skipped}, deferred this run: ${plan.summary.deferred}`,
    'Candidates:',
  ];
  for (const item of plan.candidates) {
    lines.push(
      `  #${item.number} ${item.headRefName} -> rebase :: ${item.reason}`
    );
  }
  if (plan.deferred.length > 0) {
    lines.push('Deferred (capacity):');
    for (const item of plan.deferred) {
      lines.push(`  #${item.number} ${item.headRefName}`);
    }
  }
  return `${lines.join('\n')}\n`;
}