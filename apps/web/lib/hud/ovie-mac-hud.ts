import type { LybDailyMrr } from '@/lib/ovie/lyb-mrr';

export const YC_EXCEPTIONAL_GROWTH = 0.1;
export const YC_GOOD_GROWTH_MIN = 0.05;
export const OVIE_MAC_HUD_IN_FLIGHT_PR_LIMIT = 8;
/** Lane-owned heads. Dependabot and human branches are not in flight. */
const LANE_BRANCH_RE = /^(?:devin|codex)\//;

export type OvieMacHudStatus = 'alive' | 'dead' | 'unknown';
export type OvieMacHudGrowthSource = 'revenue' | 'active-users';
export type OvieMacHudYcBar = 'exceptional' | 'good' | 'not-figured-out';

export type OvieMacHudAliveInput = {
  cashUsd: number | null;
  weeklyBurnUsd: number | null;
  weeklyRevenueUsd: number | null;
  weeklyRevenueGrowthRate: number | null;
  available: boolean;
};

export type OvieMacHudAliveMetric = OvieMacHudAliveInput & {
  status: OvieMacHudStatus;
  reachesProfitBeforeZero: boolean | null;
  detail: string;
};

export type OvieMacHudGrowthInput = {
  thisWeekRevenueUsd: number | null;
  lastWeekRevenueUsd: number | null;
  thisWeekActiveUsers: number | null;
  lastWeekActiveUsers: number | null;
};

export type OvieMacHudGrowthMetric = {
  rate: number;
  source: OvieMacHudGrowthSource;
  ycBar: OvieMacHudYcBar;
  thisWeek: number;
  lastWeek: number;
  available: boolean;
  showChart: false;
};

export type OvieMacHudShippingMetric = {
  shipsThisWeek: number;
  available: boolean;
  detail: string;
};

export type OvieMacHudInFlightPrStatus =
  | 'open'
  | 'in_review'
  | 'merge_queue'
  | 'blocked';

export type OvieMacHudInFlightPrAvailability =
  | 'available'
  | 'not_configured'
  | 'error';

export type OvieMacHudInFlightPullRequest = {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  authorLogin: string | null;
  updatedAtIso: string;
  status: OvieMacHudInFlightPrStatus;
  statusLabel: string;
  statusDetail: string;
  mergeQueuePosition: number | null;
};

export type OvieMacHudInFlightPullRequests = {
  availability: OvieMacHudInFlightPrAvailability;
  totalOpen: number;
  items: readonly OvieMacHudInFlightPullRequest[];
  truncated: boolean;
  errorMessage: string | null;
};

export type OvieMacHudSnapshot = {
  alive: OvieMacHudAliveMetric;
  growth: OvieMacHudGrowthMetric;
  shipping: OvieMacHudShippingMetric;
  inFlightPullRequests: OvieMacHudInFlightPullRequests;
  lybMrr?: LybDailyMrr;
  generatedAtIso: string;
};

type NormalizedGithubPullRequest = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly headRefName: string;
  readonly authorLogin: string | null;
  readonly updatedAtIso: string;
  readonly isDraft: boolean;
  readonly reviewDecision: string | null;
  readonly mergeable: string | null;
  readonly labels: readonly string[];
  readonly reviewRequestCount: number;
};

type MergeQueueMembership = {
  readonly position: number;
  readonly state: string;
};

const BLOCKING_PR_LABELS = new Set([
  'blocked',
  'do-not-merge',
  'do not merge',
  'gated',
  'hold',
]);

const PR_STATUS_LABELS: Record<OvieMacHudInFlightPrStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  merge_queue: 'MQ',
  blocked: 'Blocked',
};

const PR_STATUS_PRIORITY: Record<OvieMacHudInFlightPrStatus, number> = {
  merge_queue: 0,
  blocked: 1,
  in_review: 2,
  open: 3,
};

export function emptyOvieMacHudInFlightPullRequests(
  availability: Exclude<OvieMacHudInFlightPrAvailability, 'available'>,
  errorMessage: string | null = null
): OvieMacHudInFlightPullRequests {
  return {
    availability,
    totalOpen: 0,
    items: [],
    truncated: false,
    errorMessage,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeIso(value: unknown): string | null {
  const source = nonEmptyString(value);
  if (!source) return null;
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeLabels(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return [];
  return value.nodes
    .map(label => (isRecord(label) ? nonEmptyString(label.name) : null))
    .filter((label): label is string => label !== null);
}

function reviewRequestCount(value: unknown): number {
  if (!isRecord(value)) return 0;
  return Number.isInteger(value.totalCount) && Number(value.totalCount) >= 0
    ? Number(value.totalCount)
    : 0;
}

function normalizePullRequestNode(
  value: unknown
): NormalizedGithubPullRequest | null {
  if (!isRecord(value)) return null;
  const number = positiveInteger(value.number);
  const title = nonEmptyString(value.title);
  const url = nonEmptyString(value.url);
  const updatedAtIso = normalizeIso(value.updatedAt);
  if (!number || !title || !url || !updatedAtIso) return null;

  const authorLogin = isRecord(value.author)
    ? nonEmptyString(value.author.login)
    : null;

  return {
    number,
    title,
    url,
    headRefName: nonEmptyString(value.headRefName) ?? 'unknown',
    authorLogin,
    updatedAtIso,
    isDraft: value.isDraft === true,
    reviewDecision: nonEmptyString(value.reviewDecision),
    mergeable: nonEmptyString(value.mergeable),
    labels: normalizeLabels(value.labels),
    reviewRequestCount: reviewRequestCount(value.reviewRequests),
  };
}

function normalizeMergeQueueMemberships(
  entries: readonly unknown[]
): Map<number, MergeQueueMembership> {
  const memberships = new Map<number, MergeQueueMembership>();
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry.pullRequest)) continue;
    const number = positiveInteger(entry.pullRequest.number);
    const position = nonNegativeInteger(entry.position);
    if (number === null || position === null) continue;
    memberships.set(number, {
      position,
      state: nonEmptyString(entry.state) ?? 'QUEUED',
    });
  }
  return memberships;
}

function hasBlockingPrLabel(labels: readonly string[]): boolean {
  return labels.some(label => BLOCKING_PR_LABELS.has(label.toLowerCase()));
}

export function classifyOvieMacHudPullRequest(input: {
  readonly isDraft: boolean;
  readonly reviewDecision: string | null;
  readonly mergeable: string | null;
  readonly labels: readonly string[];
  readonly reviewRequestCount: number;
  readonly mergeQueuePosition: number | null;
}): OvieMacHudInFlightPrStatus {
  if (input.mergeQueuePosition != null) return 'merge_queue';
  if (input.isDraft) return 'open';
  if (
    hasBlockingPrLabel(input.labels) ||
    input.reviewDecision === 'CHANGES_REQUESTED' ||
    input.mergeable === 'CONFLICTING'
  ) {
    return 'blocked';
  }
  if (
    input.reviewRequestCount > 0 ||
    input.reviewDecision === 'REVIEW_REQUIRED' ||
    input.reviewDecision === 'APPROVED'
  ) {
    return 'in_review';
  }
  return 'open';
}

function statusDetail(
  pr: NormalizedGithubPullRequest,
  membership: MergeQueueMembership | null
): string {
  if (membership) return `Position ${membership.position}`;
  if (pr.isDraft) return 'Draft';
  if (hasBlockingPrLabel(pr.labels)) return 'Blocking label';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'Changes requested';
  if (pr.mergeable === 'CONFLICTING') return 'Merge conflict';
  if (pr.reviewRequestCount > 0) return 'Review requested';
  if (pr.reviewDecision === 'APPROVED') return 'Approved';
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return 'Review required';
  return 'Ready';
}

function comparePullRequests(
  a: OvieMacHudInFlightPullRequest,
  b: OvieMacHudInFlightPullRequest
): number {
  const priorityDelta =
    PR_STATUS_PRIORITY[a.status] - PR_STATUS_PRIORITY[b.status];
  if (priorityDelta !== 0) return priorityDelta;
  if (a.mergeQueuePosition != null && b.mergeQueuePosition != null) {
    return a.mergeQueuePosition - b.mergeQueuePosition;
  }
  return Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso);
}

export function composeOvieMacHudInFlightPullRequests(input: {
  readonly pullRequests: readonly unknown[];
  readonly mergeQueueEntries: readonly unknown[];
  readonly totalOpen: number;
  readonly sourceTruncated?: boolean;
  readonly limit?: number;
}): OvieMacHudInFlightPullRequests {
  const limit = input.limit ?? OVIE_MAC_HUD_IN_FLIGHT_PR_LIMIT;
  const memberships = normalizeMergeQueueMemberships(input.mergeQueueEntries);
  const byNumber = new Map<number, NormalizedGithubPullRequest>();

  for (const node of input.pullRequests) {
    const pr = normalizePullRequestNode(node);
    if (pr) byNumber.set(pr.number, pr);
  }

  for (const entry of input.mergeQueueEntries) {
    if (!isRecord(entry) || !isRecord(entry.pullRequest)) continue;
    const pr = normalizePullRequestNode(entry.pullRequest);
    if (pr && !byNumber.has(pr.number)) byNumber.set(pr.number, pr);
  }

  const items = [...byNumber.values()]
    .filter(
      pr => memberships.has(pr.number) || LANE_BRANCH_RE.test(pr.headRefName)
    )
    .map((pr): OvieMacHudInFlightPullRequest => {
      const membership = memberships.get(pr.number) ?? null;
      const mergeQueuePosition = membership?.position ?? null;
      const status = classifyOvieMacHudPullRequest({
        isDraft: pr.isDraft,
        reviewDecision: pr.reviewDecision,
        mergeable: pr.mergeable,
        labels: pr.labels,
        reviewRequestCount: pr.reviewRequestCount,
        mergeQueuePosition,
      });

      return {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        headRefName: pr.headRefName,
        authorLogin: pr.authorLogin,
        updatedAtIso: pr.updatedAtIso,
        status,
        statusLabel: PR_STATUS_LABELS[status],
        statusDetail: statusDetail(pr, membership),
        mergeQueuePosition,
      };
    })
    .sort(comparePullRequests);

  // `totalOpen` counts in-flight (lane or queued) PRs, not every open PR:
  // dependabot and parked human branches are not in flight. A truncated
  // source page can hide more, so its reported total stays the lower bound.
  const sourceTruncated = input.sourceTruncated === true;
  const shownItems = items.slice(0, limit);
  return {
    availability: 'available',
    totalOpen: sourceTruncated
      ? Math.max(input.totalOpen, items.length)
      : items.length,
    items: shownItems,
    truncated: sourceTruncated || shownItems.length < items.length,
    errorMessage: null,
  };
}

export function monthlyToWeeklyUsd(monthlyUsd: number): number {
  return (monthlyUsd * 12) / 52;
}

export function windowToWeeklyUsd(
  amountUsd: number,
  windowDays: number
): number {
  return windowDays > 0 ? (amountUsd / windowDays) * 7 : 0;
}

export function weeklyGrowthFromPeriodRate(
  periodRate: number,
  periodDays: number
): number {
  return periodDays > 0 ? (1 + periodRate) ** (7 / periodDays) - 1 : 0;
}

export function computeDefaultAlive(
  input: OvieMacHudAliveInput
): OvieMacHudAliveMetric {
  const cashUsd = input.available ? input.cashUsd : null;
  const weeklyBurnUsd = input.available ? input.weeklyBurnUsd : null;
  const weeklyRevenueUsd = input.available ? input.weeklyRevenueUsd : null;
  const base = { ...input, cashUsd, weeklyBurnUsd, weeklyRevenueUsd };

  if (
    !input.available ||
    cashUsd == null ||
    weeklyBurnUsd == null ||
    weeklyRevenueUsd == null
  ) {
    return {
      ...base,
      status: 'unknown',
      reachesProfitBeforeZero: null,
      detail: 'Alive numbers unavailable.',
    };
  }

  if (weeklyRevenueUsd === 0 && weeklyBurnUsd > 0) {
    return {
      ...base,
      status: 'dead',
      reachesProfitBeforeZero: false,
      detail: '$0 revenue with burn is default dead.',
    };
  }

  const netWeeklyBurn = weeklyBurnUsd - weeklyRevenueUsd;
  if (netWeeklyBurn <= 0) {
    return {
      ...base,
      status: 'alive',
      reachesProfitBeforeZero: true,
      detail: 'Revenue already covers burn.',
    };
  }

  const growth = input.weeklyRevenueGrowthRate ?? 0;
  const weeksOfCash = cashUsd > 0 ? cashUsd / netWeeklyBurn : 0;
  const profitWeeks =
    weeklyRevenueUsd > 0 && growth > 0
      ? Math.log(weeklyBurnUsd / weeklyRevenueUsd) / Math.log(1 + growth)
      : null;
  const reachesProfitBeforeZero =
    profitWeeks != null && weeksOfCash > 0 && profitWeeks <= weeksOfCash;

  return {
    ...base,
    status: reachesProfitBeforeZero ? 'alive' : 'dead',
    reachesProfitBeforeZero,
    detail: reachesProfitBeforeZero
      ? 'Current burn and growth reach profit before cash hits zero.'
      : 'Burn and growth do not reach profit before cash hits zero.',
  };
}

function wowRate(thisWeek: number, lastWeek: number): number {
  if (lastWeek === 0) return 0;
  return (thisWeek - lastWeek) / lastWeek;
}

export function gradeYcGrowth(rate: number): OvieMacHudYcBar {
  if (rate >= YC_EXCEPTIONAL_GROWTH) return 'exceptional';
  if (rate >= YC_GOOD_GROWTH_MIN) return 'good';
  return 'not-figured-out';
}

export function ycBarLabel(bar: OvieMacHudYcBar): string {
  if (bar === 'exceptional') return '10% exceptional';
  if (bar === 'good') return '5–7%/week good';
  return '1% means not figured out';
}

export function computeWowGrowth(
  input: OvieMacHudGrowthInput
): OvieMacHudGrowthMetric {
  const revenueThis = input.thisWeekRevenueUsd;
  const revenueLast = input.lastWeekRevenueUsd;
  if (
    revenueThis != null &&
    revenueLast != null &&
    (revenueThis > 0 || revenueLast > 0)
  ) {
    const rate = wowRate(revenueThis, revenueLast);
    return {
      rate,
      source: 'revenue',
      ycBar: gradeYcGrowth(rate),
      thisWeek: revenueThis,
      lastWeek: revenueLast,
      available: true,
      showChart: false,
    };
  }

  const usersThis = input.thisWeekActiveUsers;
  const usersLast = input.lastWeekActiveUsers;
  if (usersThis == null || usersLast == null) {
    return {
      rate: 0,
      source: 'active-users',
      ycBar: 'not-figured-out',
      thisWeek: 0,
      lastWeek: 0,
      available: false,
      showChart: false,
    };
  }
  const rate = wowRate(usersThis, usersLast);
  return {
    rate,
    source: 'active-users',
    ycBar: gradeYcGrowth(rate),
    thisWeek: usersThis,
    lastWeek: usersLast,
    available: true,
    showChart: false,
  };
}

/**
 * Shipping throughput is merged PRs across the org: the last seven days,
 * with today's count since Pacific midnight in the detail line.
 */
export function shippingFromMerges(
  merges: {
    readonly last7Days: number | null;
    readonly today: number | null;
  } | null
): OvieMacHudShippingMetric {
  if (merges?.last7Days == null) {
    return {
      shipsThisWeek: 0,
      available: false,
      detail: 'GitHub merge counts unavailable.',
    };
  }
  return {
    shipsThisWeek: merges.last7Days,
    available: true,
    detail:
      merges.today == null
        ? 'PRs merged across JovieInc in the last 7 days.'
        : `PRs merged across JovieInc in the last 7 days. ${merges.today.toLocaleString('en-US')} since midnight PT.`,
  };
}

export function composeOvieMacHudSnapshot(input: {
  alive: OvieMacHudAliveInput;
  growth: OvieMacHudGrowthInput;
  shipping: OvieMacHudShippingMetric;
  inFlightPullRequests?: OvieMacHudInFlightPullRequests;
  lybMrr?: LybDailyMrr;
  generatedAtIso: string;
}): OvieMacHudSnapshot {
  return {
    alive: computeDefaultAlive(input.alive),
    growth: computeWowGrowth(input.growth),
    shipping: input.shipping,
    inFlightPullRequests:
      input.inFlightPullRequests ??
      emptyOvieMacHudInFlightPullRequests('not_configured'),
    ...(input.lybMrr ? { lybMrr: input.lybMrr } : {}),
    generatedAtIso: input.generatedAtIso,
  };
}
