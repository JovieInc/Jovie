import { computeRatePercent } from '@/lib/analytics/metrics';
import type {
  FinanceAccount,
  FinanceTransaction,
} from '@/lib/db/schema/finance';
import { FLOW_KINDS, isLedgerEffective } from '@/lib/finance/ledger';

/**
 * Money overview metrics (JOV-4616 → consumed by JOV-4618).
 *
 * Pure computation over owner-scoped repository rows. Sign convention
 * follows the provider contract (Plaid-style): `amount > 0` is money OUT
 * (an expense), `amount < 0` is money IN (income). Scope classification
 * uses the `category` field: categories prefixed `creator:` or `business:`
 * (or exactly `creator`/`business`) are creator economics; everything else
 * is personal. Uncategorized rows still count toward totals AND toward the
 * classification-review queue — they never silently disappear.
 */

export const MONEY_WINDOW_DAYS = 30;
export const MIN_HISTORY_DAYS = 14;
const STALE_DAYS = 3;
const MS_PER_DAY = 86_400_000;

export type MoneyOverviewState =
  | 'no-connections'
  | 'syncing'
  | 'provider-error'
  | 'insufficient-history'
  | 'ready';

export type MoneyScope = 'personal' | 'creator';
export type MoneyMetricId =
  | 'cash'
  | 'income'
  | 'burn'
  | 'netCashFlow'
  | 'runway'
  | 'personalIncome'
  | 'personalSpend'
  | 'personalNet'
  | 'creatorIncome'
  | 'creatorSpend'
  | 'creatorNet';

export interface MoneyMetric {
  id: MoneyMetricId;
  label: string;
  value: number | null;
  unit: 'currency' | 'days';
  deltaAbs: number | null;
  deltaPct: number | null;
  comparisonDays: number | null;
  /** Direction that improves the metric. */
  desiredDirection: 'up' | 'down';
  /** Whether the observed movement is favorable. Null when no delta exists. */
  favorable: boolean | null;
  target: 'on-track' | 'at-risk' | 'no-target' | 'unknown';
  confidence: 'high' | 'low' | 'insufficient';
}

export interface MoneyTrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  income: number;
  personalExpenses: number;
  creatorExpenses: number;
  netCashFlow: number;
  cashBalance: number;
}

export interface MoneyOverview {
  generatedAt: string;
  reconciledAt: string | null;
  state: MoneyOverviewState;
  anomalies: string[];
  windowDays: number;
  reviewCount: number;
  counts: {
    institutions: number;
    accounts: number;
    cashAccounts: number;
    excludedAccounts: number;
  };
  conclusion: {
    headline: string;
    detail: string;
    tone: 'positive' | 'negative' | 'neutral';
  };
  cards: MoneyMetric[];
  personal: { income: MoneyMetric; expenses: MoneyMetric; net: MoneyMetric };
  creator: {
    income: MoneyMetric;
    expenses: MoneyMetric;
    net: MoneyMetric;
    hasIncome: boolean;
  };
  /** Daily series across all available history; the client slices windows. */
  trend: MoneyTrendPoint[];
  earliestDataAt: string | null;
}

export function classifyTransactionScope(
  category: string | null | undefined
): MoneyScope {
  const c = (category ?? '').trim().toLowerCase();
  return /^(creator|business)(:|$)/.test(c) ? 'creator' : 'personal';
}

export function transactionNeedsReview(
  category: string | null | undefined
): boolean {
  const c = (category ?? '').trim().toLowerCase();
  return c === '' || c === 'uncategorized' || c === 'review';
}

function isExcludedAccount(account: FinanceAccount): boolean {
  const t = (account.accountType ?? '').toLowerCase();
  return t === 'excluded' || t === 'hidden';
}

function isCashAccount(account: FinanceAccount): boolean {
  if (isExcludedAccount(account)) return false;
  const t = (account.accountType ?? '').toLowerCase();
  return ['checking', 'savings', 'depository', 'cash'].includes(t);
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toMillis(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function sumTx(
  txs: FinanceTransaction[],
  fromMs: number,
  toMs: number,
  pick: (tx: FinanceTransaction) => boolean
): number {
  let sum = 0;
  for (const tx of txs) {
    const t = toMillis(tx.occurredAt);
    if (t === null || t < fromMs || t >= toMs) continue;
    if (!pick(tx)) continue;
    const amount = toNumber(tx.amount) ?? 0;
    // Income is negative amount; express as positive magnitude.
    sum += amount < 0 ? -amount : amount;
  }
  return sum;
}

const isIncome = (tx: FinanceTransaction) => (toNumber(tx.amount) ?? 0) < 0;
const isExpense = (tx: FinanceTransaction) => (toNumber(tx.amount) ?? 0) > 0;
const isScope = (scope: MoneyScope) => (tx: FinanceTransaction) =>
  classifyTransactionScope(tx.category) === scope;

function makeMetric(
  id: MoneyMetricId,
  label: string,
  value: number | null,
  opts: {
    unit?: 'currency' | 'days';
    previous?: number | null;
    comparisonDays?: number | null;
    desiredDirection: 'up' | 'down';
    target?: MoneyMetric['target'];
    confidence?: MoneyMetric['confidence'];
  }
): MoneyMetric {
  const previous = opts.previous ?? null;
  const deltaAbs =
    value !== null && previous !== null ? value - previous : null;
  const deltaPct =
    deltaAbs !== null && previous !== 0
      ? computeRatePercent(deltaAbs, Math.abs(previous!))
      : null;
  const favorable =
    deltaAbs === null || deltaAbs === 0
      ? null
      : opts.desiredDirection === 'up'
        ? deltaAbs > 0
        : deltaAbs < 0;
  return {
    id,
    label,
    value,
    unit: opts.unit ?? 'currency',
    deltaAbs,
    deltaPct,
    comparisonDays: opts.comparisonDays ?? null,
    desiredDirection: opts.desiredDirection,
    favorable,
    target: opts.target ?? 'unknown',
    confidence: opts.confidence ?? 'high',
  };
}

function scopeMetrics(
  scope: MoneyScope,
  income: number,
  expenses: number,
  prevIncome: number | null,
  prevExpenses: number | null,
  confidence: MoneyMetric['confidence']
) {
  const label = scope === 'personal' ? 'Personal' : 'Creator';
  const common = { comparisonDays: MONEY_WINDOW_DAYS, confidence };
  return {
    income: makeMetric(`${scope}Income`, `${label} income`, income, {
      ...common,
      previous: prevIncome,
      desiredDirection: 'up',
      target: 'no-target',
    }),
    expenses: makeMetric(`${scope}Spend`, `${label} spend`, expenses, {
      ...common,
      previous: prevExpenses,
      desiredDirection: 'down',
      target: 'no-target',
    }),
    net: makeMetric(`${scope}Net`, `${label} net`, income - expenses, {
      ...common,
      previous:
        prevIncome === null || prevExpenses === null
          ? null
          : prevIncome - prevExpenses,
      desiredDirection: 'up',
      target: income - expenses >= 0 ? 'on-track' : 'at-risk',
    }),
  };
}

export function buildMoneyOverview(input: {
  institutions: { status: string }[];
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  now?: Date;
}): MoneyOverview {
  const { institutions, accounts, transactions } = input;
  const effectiveTransactions = transactions.filter(tx => {
    const flowKind = FLOW_KINDS.find(kind => kind === tx.flowKind);
    return (
      tx.status === 'posted' &&
      flowKind !== undefined &&
      isLedgerEffective({ status: tx.status, flowKind })
    );
  });
  const now = (input.now ?? new Date()).getTime();
  const windowMs = MONEY_WINDOW_DAYS * MS_PER_DAY;

  const cashAccounts = accounts.filter(isCashAccount);
  const excludedCount = accounts.filter(isExcludedAccount).length;
  const cashBalance = cashAccounts.reduce(
    (sum, a) =>
      sum + (toNumber(a.availableBalance) ?? toNumber(a.currentBalance) ?? 0),
    0
  );

  const timestamps = transactions
    .map(t => toMillis(t.occurredAt))
    .filter((t): t is number => t !== null);
  const earliest = timestamps.length ? Math.min(...timestamps) : null;
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const historyDays = earliest !== null ? (now - earliest) / MS_PER_DAY : 0;

  let reconciledAtMs = latest ?? Number.NEGATIVE_INFINITY;
  for (const a of accounts) {
    const bu = toMillis(a.balanceUpdatedAt);
    if (bu !== null && bu > reconciledAtMs) reconciledAtMs = bu;
  }
  const reconciledAt =
    reconciledAtMs === Number.NEGATIVE_INFINITY
      ? null
      : new Date(reconciledAtMs).toISOString();

  const reviewCount = effectiveTransactions.filter(t =>
    transactionNeedsReview(t.category)
  ).length;

  // ---- state resolution -------------------------------------------------
  let state: MoneyOverviewState = 'ready';
  if (institutions.length === 0) {
    state = 'no-connections';
  } else if (
    institutions.some(i => i.status === 'error' || i.status === 'degraded')
  ) {
    state = 'provider-error';
  } else if (
    institutions.some(i => i.status === 'syncing' || i.status === 'pending') ||
    transactions.length === 0
  ) {
    state = 'syncing';
  } else if (historyDays < MIN_HISTORY_DAYS) {
    state = 'insufficient-history';
  }

  const anomalies: string[] = [];
  if (latest !== null && now - latest > STALE_DAYS * MS_PER_DAY) {
    anomalies.push('stale-data');
  }
  if (cashAccounts.some(a => toNumber(a.currentBalance) === null)) {
    anomalies.push('missing-balance');
  }
  const staleBalance = cashAccounts.some(a => {
    const bu = toMillis(a.balanceUpdatedAt);
    return bu !== null && latest !== null && latest - bu > 7 * MS_PER_DAY;
  });
  if (staleBalance) anomalies.push('reconciliation-gap');

  const confidence: MoneyMetric['confidence'] =
    state === 'insufficient-history' || state === 'no-connections'
      ? 'insufficient'
      : historyDays < MONEY_WINDOW_DAYS
        ? 'low'
        : 'high';

  const cur = [now - windowMs, now] as const;
  const prev = [now - 2 * windowMs, now - windowMs] as const;
  const hasPrior = effectiveTransactions.some(tx => {
    const at = toMillis(tx.occurredAt);
    return at !== null && at >= prev[0] && at < prev[1];
  });

  const exp = (s: MoneyScope) => (tx: FinanceTransaction) =>
    isExpense(tx) && isScope(s)(tx);
  const inc = (s: MoneyScope) => (tx: FinanceTransaction) =>
    isIncome(tx) && isScope(s)(tx);
  const S = (
    r: readonly [number, number],
    pick: (t: FinanceTransaction) => boolean
  ) => sumTx(effectiveTransactions, r[0], r[1], pick);
  const P = (pick: (t: FinanceTransaction) => boolean) =>
    hasPrior ? S(prev, pick) : null;

  const income = S(cur, isIncome);
  const personalSpend = S(cur, exp('personal'));
  const creatorSpend = S(cur, exp('creator'));
  const personalIncome = S(cur, inc('personal'));
  const creatorIncome = S(cur, inc('creator'));

  const prevIncome = P(isIncome);
  const prevPersonalSpend = P(exp('personal'));
  const prevCreatorSpend = P(exp('creator'));
  const prevPersonalIncome = P(inc('personal'));
  const prevCreatorIncome = P(inc('creator'));

  const totalSpend = personalSpend + creatorSpend;
  const prevTotalSpend =
    prevPersonalSpend !== null || prevCreatorSpend !== null
      ? (prevPersonalSpend ?? 0) + (prevCreatorSpend ?? 0)
      : null;
  const netCashFlow = income - totalSpend;
  const dailyBurn = totalSpend / MONEY_WINDOW_DAYS;
  const runwayDays =
    cashAccounts.length === 0
      ? null
      : dailyBurn > 0
        ? cashBalance / dailyBurn
        : null;

  const runwayTarget: MoneyMetric['target'] =
    runwayDays === null
      ? 'unknown'
      : runwayDays >= 180
        ? 'on-track'
        : runwayDays < 90
          ? 'at-risk'
          : 'no-target';

  const cards: MoneyMetric[] = [
    makeMetric(
      'cash',
      'Available cash',
      cashAccounts.length ? cashBalance : null,
      {
        desiredDirection: 'up',
        target: cashAccounts.length ? 'no-target' : 'unknown',
        confidence,
      }
    ),
    makeMetric('income', 'Income (30d)', transactions.length ? income : null, {
      previous: prevIncome,
      comparisonDays: MONEY_WINDOW_DAYS,
      desiredDirection: 'up',
      target: 'no-target',
      confidence,
    }),
    makeMetric(
      'burn',
      'Total burn (30d)',
      transactions.length ? totalSpend : null,
      {
        previous: prevTotalSpend,
        comparisonDays: MONEY_WINDOW_DAYS,
        desiredDirection: 'down',
        target: 'no-target',
        confidence,
      }
    ),
    makeMetric(
      'netCashFlow',
      'Net cash flow (30d)',
      transactions.length ? netCashFlow : null,
      {
        previous:
          prevIncome !== null || prevTotalSpend !== null
            ? (prevIncome ?? 0) - (prevTotalSpend ?? 0)
            : null,
        comparisonDays: MONEY_WINDOW_DAYS,
        desiredDirection: 'up',
        target: transactions.length
          ? netCashFlow >= 0
            ? 'on-track'
            : 'at-risk'
          : 'unknown',
        confidence,
      }
    ),
    makeMetric('runway', 'Runway', runwayDays, {
      unit: 'days',
      desiredDirection: 'up',
      target: runwayTarget,
      confidence,
    }),
  ];

  const personal = scopeMetrics(
    'personal',
    personalIncome,
    personalSpend,
    prevPersonalIncome,
    prevPersonalSpend,
    confidence
  );
  const creator = {
    ...scopeMetrics(
      'creator',
      creatorIncome,
      creatorSpend,
      prevCreatorIncome,
      prevCreatorSpend,
      confidence
    ),
    hasIncome: creatorIncome > 0,
  };

  // ---- trend series -----------------------------------------------------
  const trend = buildTrend(effectiveTransactions, cashBalance, earliest, now);

  // ---- conclusion -------------------------------------------------------
  const conclusion = buildConclusion({
    state,
    netCashFlow,
    runwayDays,
    reviewCount,
    hasCreatorIncome: creator.hasIncome,
    cashAccounts: cashAccounts.length,
    anomalies,
  });

  return {
    generatedAt: new Date(now).toISOString(),
    reconciledAt,
    state,
    anomalies,
    windowDays: MONEY_WINDOW_DAYS,
    reviewCount,
    counts: {
      institutions: institutions.length,
      accounts: accounts.length,
      cashAccounts: cashAccounts.length,
      excludedAccounts: excludedCount,
    },
    conclusion,
    cards,
    personal,
    creator,
    trend,
    earliestDataAt: earliest !== null ? new Date(earliest).toISOString() : null,
  };
}

function buildTrend(
  transactions: FinanceTransaction[],
  currentCash: number,
  earliestMs: number | null,
  nowMs: number
): MoneyTrendPoint[] {
  if (earliestMs === null) return [];
  const startDay = Math.floor(earliestMs / MS_PER_DAY);
  const endDay = Math.floor(nowMs / MS_PER_DAY);
  const dayCount = endDay - startDay + 1;

  const income = new Array<number>(dayCount).fill(0);
  const personal = new Array<number>(dayCount).fill(0);
  const creator = new Array<number>(dayCount).fill(0);

  for (const tx of transactions) {
    const t = toMillis(tx.occurredAt);
    if (t === null) continue;
    const idx = Math.floor(t / MS_PER_DAY) - startDay;
    if (idx < 0 || idx >= dayCount) continue;
    const amount = toNumber(tx.amount) ?? 0;
    if (amount < 0) {
      income[idx] += -amount;
    } else if (classifyTransactionScope(tx.category) === 'creator') {
      creator[idx] += amount;
    } else {
      personal[idx] += amount;
    }
  }

  // Reconstruct the historical cash balance by walking backwards from the
  // current balance through net daily flow.
  const netAfter = new Array<number>(dayCount + 1).fill(0);
  for (let i = dayCount - 1; i >= 0; i--) {
    netAfter[i] = netAfter[i + 1] + (income[i] - personal[i] - creator[i]);
  }

  const points: MoneyTrendPoint[] = [];
  for (let i = 0; i < dayCount; i++) {
    const net = income[i] - personal[i] - creator[i];
    points.push({
      date: isoDay((startDay + i) * MS_PER_DAY),
      income: income[i],
      personalExpenses: personal[i],
      creatorExpenses: creator[i],
      netCashFlow: net,
      cashBalance: currentCash - netAfter[i + 1],
    });
  }
  return points;
}

function buildConclusion(input: {
  state: MoneyOverviewState;
  netCashFlow: number;
  runwayDays: number | null;
  reviewCount: number;
  hasCreatorIncome: boolean;
  cashAccounts: number;
  anomalies: string[];
}): MoneyOverview['conclusion'] {
  const STATE_COPY: Record<
    Exclude<MoneyOverviewState, 'ready'>,
    MoneyOverview['conclusion']
  > = {
    'no-connections': {
      headline: 'Connect an account to see your money.',
      detail:
        'Link a bank or card account and Jovie builds your personal and creator economics privately — visible only to you.',
      tone: 'neutral',
    },
    syncing: {
      headline: 'Your accounts are still syncing.',
      detail:
        'Initial sync is in progress. Trends, burn, and runway appear once transactions arrive.',
      tone: 'neutral',
    },
    'provider-error': {
      headline: 'A connected account needs attention.',
      detail:
        'One or more institutions reported an error. Reconnect to resume sync.',
      tone: 'negative',
    },
    'insufficient-history': {
      headline: 'Not enough history yet for reliable trends.',
      detail: `At least ${MIN_HISTORY_DAYS} days of transactions are needed before burn and runway are trustworthy.`,
      tone: 'neutral',
    },
  };
  if (input.state !== 'ready') return STATE_COPY[input.state];

  if (input.cashAccounts === 0) {
    return {
      headline: 'No cash accounts found.',
      detail:
        'Runway needs a checking or savings balance. Connect a cash account to see how long your money lasts.',
      tone: 'neutral',
    };
  }

  const positive = input.netCashFlow >= 0;
  const runwayText =
    input.runwayDays === null
      ? 'spend is near zero'
      : input.runwayDays >= 180
        ? `${Math.round(input.runwayDays)} days of runway`
        : `only ${Math.round(input.runwayDays)} days of runway`;
  const reviewNote =
    input.reviewCount > 0
      ? ` ${input.reviewCount} transaction${input.reviewCount === 1 ? '' : 's'} need classification review.`
      : '';

  return {
    headline: positive
      ? 'You are earning more than you spend.'
      : 'You are spending more than you earn.',
    detail: `${positive ? 'Positive' : 'Negative'} cash flow over the last ${MONEY_WINDOW_DAYS} days with ${runwayText}.${reviewNote}`,
    tone: positive ? 'positive' : 'negative',
  };
}
