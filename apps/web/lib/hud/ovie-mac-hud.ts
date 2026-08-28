export const YC_EXCEPTIONAL_GROWTH = 0.1;
export const YC_GOOD_GROWTH_MIN = 0.05;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PROD_SHA_RE = /^[0-9a-f]{7,40}$/i;
const SHIPPING_DETAIL =
  'Dogfood-receipted ships (Linear → Symphony → native MQ → prod SHA → receipt). Merges without receipts do not count.';

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

export type OvieMacHudSnapshot = {
  alive: OvieMacHudAliveMetric;
  growth: OvieMacHudGrowthMetric;
  shipping: OvieMacHudShippingMetric;
  generatedAtIso: string;
};

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

function textField(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return String(Math.trunc(value));
    }
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function parseReceiptedShip(value: unknown): {
  linearIssue: string;
  symphonyRef: string;
  mergeQueueRef: string;
  prodSha: string;
  receiptAt: string;
} | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const linearIssue = textField(record, [
    'linearIssue',
    'issueNumber',
    'issue',
  ]);
  const symphonyRef = textField(record, ['symphonyRef', 'symphony']);
  const mergeQueueRef = textField(record, [
    'mergeQueueRef',
    'mergeQueue',
    'mergeQueueEntry',
  ]);
  const prodSha = textField(record, ['prodSha', 'prodSHA']);
  const receiptAt = textField(record, ['receiptAt', 'receiptedAt']);
  if (
    !linearIssue ||
    !symphonyRef ||
    !mergeQueueRef ||
    !prodSha ||
    !receiptAt ||
    !PROD_SHA_RE.test(prodSha) ||
    Number.isNaN(Date.parse(receiptAt))
  ) {
    return null;
  }
  return { linearIssue, symphonyRef, mergeQueueRef, prodSha, receiptAt };
}

export function countReceiptedShipsThisWeek(
  entries: readonly unknown[],
  nowMs: number = Date.now(),
  sourceAvailable = true
): OvieMacHudShippingMetric {
  if (!sourceAvailable) {
    return {
      shipsThisWeek: 0,
      available: false,
      detail: 'Shipping receipts unavailable.',
    };
  }

  const weekStart = nowMs - WEEK_MS;
  let shipsThisWeek = 0;
  for (const entry of entries) {
    const ship = parseReceiptedShip(entry);
    if (!ship) continue;
    const receiptMs = Date.parse(ship.receiptAt);
    if (receiptMs >= weekStart && receiptMs <= nowMs) shipsThisWeek += 1;
  }
  return { shipsThisWeek, available: true, detail: SHIPPING_DETAIL };
}

export function composeOvieMacHudSnapshot(input: {
  alive: OvieMacHudAliveInput;
  growth: OvieMacHudGrowthInput;
  shippingEntries: readonly unknown[];
  shippingAvailable?: boolean;
  generatedAtIso: string;
  nowMs?: number;
}): OvieMacHudSnapshot {
  return {
    alive: computeDefaultAlive(input.alive),
    growth: computeWowGrowth(input.growth),
    shipping: countReceiptedShipsThisWeek(
      input.shippingEntries,
      input.nowMs ?? Date.parse(input.generatedAtIso),
      input.shippingAvailable ?? true
    ),
    generatedAtIso: input.generatedAtIso,
  };
}
