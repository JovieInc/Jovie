export const GOVERNOR_BUFFER_SCHEMA = 'jovie.eve.governor.buffer/v1' as const;
export const GOVERNOR_BUFFER_VERSION = '2026-09-06' as const;
export const DEFAULT_SYMPHONY_WORKFLOW_CAPACITY = 30 as const;

export type GovernorBufferIssue = {
  readonly id: string;
  readonly identifier: string;
  readonly team: string;
  readonly state: string;
  readonly labels: readonly string[];
  readonly assignee: string | null;
};

export type CapacitySource = {
  readonly kind: 'symphony-workflow';
  readonly value: number;
  readonly source: string;
  readonly observedAt: string;
};

export type Promotion = {
  readonly issueId: string;
  readonly identifier: string;
  readonly reason: string;
};

export type Rejection = {
  readonly issueId: string;
  readonly identifier: string;
  readonly reason: string;
};

export type GovernorBufferReceipt = {
  readonly schema: typeof GOVERNOR_BUFFER_SCHEMA;
  readonly version: typeof GOVERNOR_BUFFER_VERSION;
  readonly observedAt: string;
  readonly capacity: CapacitySource;
  readonly target: number;
  readonly qualifiedTodoCount: number;
  readonly shortage: number;
  readonly promotions: readonly Promotion[];
  readonly rejections: readonly Rejection[];
  readonly exceptions: readonly string[];
  readonly provenance: {
    readonly selector: 'summer-governor-buffer';
    readonly capacitySource: string;
  };
};

const BLOCKED_STATES = new Set([
  'In Progress',
  'In Review',
  'Rework',
  'Merging',
  'Done',
  'Canceled',
  'Cancelled',
  'Duplicate',
  'Closed',
  'Blocked',
]);

const EXCLUDED_LABELS = new Set([
  'taste',
  'steering',
  'privacy',
  'security-review',
  'credential-dependent',
  'external-message',
  'cross-repo',
  'decision-required',
  'no-symphony',
]);

const PRIORITY_RULES = [
  {
    labels: ['P0', 'production'],
    score: 1000,
    reason: 'P0 production urgency',
  },
  {
    labels: ['ci-remediation', 'merge'],
    score: 900,
    reason: 'merge/CI remediation',
  },
  {
    labels: ['founder-shipping', 'shipping-goal'],
    score: 800,
    reason: 'active founder shipping goal',
  },
  {
    labels: ['ui-invariant', 'design-invariant'],
    score: 700,
    reason: 'isolated UI/design invariant fix',
  },
  {
    labels: ['verified-backlog', 'backlog-remediation'],
    score: 600,
    reason: 'verified backlog remediation',
  },
] as const;

export class GovernorCapacityError extends Error {
  constructor(
    readonly source: string,
    readonly reason: string
  ) {
    super(`Governor capacity error from ${source}: ${reason}`);
    this.name = 'GovernorCapacityError';
  }
}

function parseCapacity(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new GovernorCapacityError(
      'env',
      `non-integer capacity value: ${value}`
    );
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 1 || parsed > 1000) {
    throw new GovernorCapacityError('env', `capacity out of bounds: ${parsed}`);
  }
  return parsed;
}

export function officialSymphonyCapacity(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date().toISOString()
): CapacitySource {
  const raw = env.SYMPHONY_WORKFLOW_CAPACITY ?? env.SYMPHONY_UI_PILOT_CAPACITY;
  const source =
    env.SYMPHONY_WORKFLOW_CAPACITY !== undefined
      ? 'env:SYMPHONY_WORKFLOW_CAPACITY'
      : 'env:SYMPHONY_UI_PILOT_CAPACITY';
  const value =
    raw === undefined ? DEFAULT_SYMPHONY_WORKFLOW_CAPACITY : parseCapacity(raw);
  return { kind: 'symphony-workflow', value, source, observedAt: now };
}

export function computeQualifiedTodoBufferTarget(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new GovernorCapacityError(
      'compute',
      'capacity must be a positive integer'
    );
  }
  return capacity * 2;
}

export function qualifyIssueForTodoBuffer(
  issue: GovernorBufferIssue,
  blockedIdentifiers: ReadonlySet<string> = new Set()
):
  | { readonly qualified: true; readonly reason: 'qualified' }
  | { readonly qualified: false; readonly reason: string } {
  if (issue.team !== 'JOV') {
    return { qualified: false, reason: 'team-not-jov' };
  }
  if (BLOCKED_STATES.has(issue.state)) {
    return {
      qualified: false,
      reason: `state-${issue.state.toLowerCase().replace(/\s+/g, '-')}`,
    };
  }
  if (issue.assignee !== null) {
    return { qualified: false, reason: 'assigned-to-lane' };
  }
  const lowerLabels = issue.labels.map(label => label.toLowerCase());
  const excluded = lowerLabels.find(label => EXCLUDED_LABELS.has(label));
  if (excluded) {
    return { qualified: false, reason: `excluded-label-${excluded}` };
  }
  if (blockedIdentifiers.has(issue.identifier)) {
    return { qualified: false, reason: 'blocked-by-open-pr-or-file-ownership' };
  }
  return { qualified: true, reason: 'qualified' };
}

export function rankTodoBufferCandidate(issue: GovernorBufferIssue): {
  readonly score: number;
  readonly reason: string;
} {
  const lowerLabels = issue.labels.map(label => label.toLowerCase());
  for (const rule of PRIORITY_RULES) {
    if (rule.labels.some(label => lowerLabels.includes(label.toLowerCase()))) {
      return { score: rule.score, reason: rule.reason };
    }
  }
  return { score: 0, reason: 'qualified backlog' };
}

export type GovernorBufferPlanInput = {
  readonly issues: readonly GovernorBufferIssue[];
  readonly qualifiedTodoCount: number;
  readonly capacity: CapacitySource;
  readonly blockedIdentifiers?: ReadonlySet<string>;
  readonly observedAt?: string;
};

export function planQualifiedTodoBuffer(
  input: GovernorBufferPlanInput
): GovernorBufferReceipt {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const target = computeQualifiedTodoBufferTarget(input.capacity.value);
  const shortage = Math.max(0, target - input.qualifiedTodoCount);
  const blockedIdentifiers = input.blockedIdentifiers ?? new Set();
  const exceptions: string[] = [];

  const evaluations = input.issues.map(issue => {
    const qualification = qualifyIssueForTodoBuffer(issue, blockedIdentifiers);
    const ranking = rankTodoBufferCandidate(issue);
    return { issue, qualification, ranking };
  });

  const rejections: Rejection[] = [];
  const candidates = evaluations
    .filter(({ issue, qualification }) => {
      if (!qualification.qualified) {
        rejections.push({
          issueId: issue.id,
          identifier: issue.identifier,
          reason: qualification.reason,
        });
        return false;
      }
      return true;
    })
    .map(({ issue, ranking }) => ({
      issue,
      score: ranking.score,
      reason: ranking.reason,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.issue.identifier.localeCompare(right.issue.identifier);
    });

  const promotions: Promotion[] = [];
  let remainingShortage = shortage;
  for (const candidate of candidates) {
    if (remainingShortage <= 0) {
      rejections.push({
        issueId: candidate.issue.id,
        identifier: candidate.issue.identifier,
        reason: 'ranked-below-buffer-cutoff',
      });
      continue;
    }
    promotions.push({
      issueId: candidate.issue.id,
      identifier: candidate.issue.identifier,
      reason: candidate.reason,
    });
    remainingShortage -= 1;
  }

  if (remainingShortage > 0) {
    exceptions.push(
      `insufficient-qualified-candidates: need ${remainingShortage} more to reach target ${target}`
    );
  }

  return {
    schema: GOVERNOR_BUFFER_SCHEMA,
    version: GOVERNOR_BUFFER_VERSION,
    observedAt,
    capacity: input.capacity,
    target,
    qualifiedTodoCount: input.qualifiedTodoCount,
    shortage,
    promotions,
    rejections,
    exceptions,
    provenance: {
      selector: 'summer-governor-buffer',
      capacitySource: input.capacity.source,
    },
  };
}
