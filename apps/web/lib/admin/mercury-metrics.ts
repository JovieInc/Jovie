import 'server-only';

import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import {
  computeMercuryDefaultStatus,
  type MercuryDefaultStatus,
} from './hud-metric-derivations';

const MERCURY_BASE_URL =
  env.MERCURY_API_BASE_URL?.trim() || 'https://api.mercury.com/api/v1';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Aligned with HUD poll cadence and other admin metric caches. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedEntry = {
  expiresAt: number;
  value: AdminMercuryMetrics;
};

const mercuryMetricsCache = new Map<string, CachedEntry>();

let lastReportedErrorKey: string | null = null;
let lastReportedErrorAt = 0;

const MERCURY_CACHE_KEY = 'admin:mercury:metrics';

interface MercuryEnv {
  apiToken: string;
  checkingAccountId: string;
}

interface MercuryTransaction {
  id?: string;
  amount?: number | string;
  currency?: string;
  direction?: string;
  type?: string;
  description?: string;
}

interface MercuryTransactionsResponse {
  transactions?: MercuryTransaction[];
  data?: MercuryTransaction[];
  nextCursor?: string;
  hasMore?: boolean;
}

export interface AdminMercuryMetrics {
  balanceUsd: number;
  burnRateUsd: number;
  burnWindowDays: number;
  /** False when the balance loaded but the transaction window did not. */
  burnRateAvailable: boolean;
  /** Provider observation time. Preserved across cache hits. */
  observedAtIso?: string;
  /** Indicates whether Mercury credentials are configured */
  isConfigured: boolean;
  /** Indicates whether the Mercury API call succeeded */
  isAvailable: boolean;
  /**
   * Explicit default-status signal.
   * - 'alive'  — balance > burn (runway > profitability horizon)
   * - 'dead'   — balance <= burn (runway ends before profitability)
   * - 'unknown' — Mercury is unavailable or data is missing; must NOT be shown as dead
   */
  defaultStatus: MercuryDefaultStatus;
  /** Error message if Mercury API call failed */
  errorMessage?: string;
}

const NON_REPORTABLE_MERCURY_API_ERROR_MARKERS = [
  '(401)',
  '(403)',
  '(404)',
  '(429)',
  '(502)',
  '(503)',
  '(504)',
  'ipNotWhitelisted',
  'ip not whitelisted',
  'notFound',
] as const;

function isNonReportableMercuryApiError(message: string): boolean {
  const normalized = message.toLowerCase();
  return NON_REPORTABLE_MERCURY_API_ERROR_MARKERS.some(marker =>
    normalized.includes(marker.toLowerCase())
  );
}

function buildUnconfiguredResponse(): AdminMercuryMetrics {
  return {
    balanceUsd: 0,
    burnRateUsd: 0,
    burnWindowDays: 30,
    burnRateAvailable: false,
    isConfigured: false,
    isAvailable: false,
    defaultStatus: 'unknown',
    observedAtIso: new Date().toISOString(),
    errorMessage:
      'Mercury credentials not configured (set MERCURY_API_TOKEN or MERCURY_API_KEY and MERCURY_CHECKING_ACCOUNT_ID or MERCURY_ACCOUNT_ID)',
  };
}

function buildErrorResponse(message: string): AdminMercuryMetrics {
  return {
    balanceUsd: 0,
    burnRateUsd: 0,
    burnWindowDays: 30,
    burnRateAvailable: false,
    isConfigured: true,
    isAvailable: false,
    defaultStatus: 'unknown',
    observedAtIso: new Date().toISOString(),
    errorMessage: `Mercury API error: ${message}`,
  };
}

function reportMercuryMetricsErrorOnce(
  message: string,
  error: unknown,
  errorMessage: string
): void {
  if (isNonReportableMercuryApiError(errorMessage)) {
    return;
  }

  const key = `${message}:${errorMessage}`;
  const now = Date.now();
  if (
    lastReportedErrorKey === key &&
    now - lastReportedErrorAt < CACHE_TTL_MS
  ) {
    return;
  }

  lastReportedErrorKey = key;
  lastReportedErrorAt = now;
  captureError(message, error);
}

function getMercuryEnv(): MercuryEnv | null {
  // Use logical OR to treat empty strings as missing (fallback to secondary key)
  const apiToken =
    env.MERCURY_API_TOKEN?.trim() || env.MERCURY_API_KEY?.trim() || '';
  const checkingAccountId =
    env.MERCURY_CHECKING_ACCOUNT_ID?.trim() ||
    env.MERCURY_ACCOUNT_ID?.trim() ||
    '';

  if (!apiToken || !checkingAccountId) {
    return null;
  }

  return { apiToken, checkingAccountId };
}

async function fetchMercury<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const mercuryEnv = getMercuryEnv();
  if (!mercuryEnv) {
    throw new TypeError('Mercury API credentials are not configured.');
  }

  const url = new URL(`${MERCURY_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await serverFetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mercuryEnv.apiToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    // Mercury transactions endpoint can be slow when paginating 30 days of data.
    // 8s gives enough headroom without blocking the HUD indefinitely.
    timeoutMs: 8000,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercury API error (${response.status}) ${path}: ${body}`);
  }

  return (await response.json()) as T;
}

function normalizeAmount(amount: MercuryTransaction['amount']): number {
  const normalized =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string' && amount.trim().length > 0
        ? Number(amount)
        : Number.NaN;
  if (!Number.isFinite(normalized)) {
    throw new TypeError('Mercury transaction amount is missing or invalid.');
  }
  return normalized;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} is missing or invalid.`);
  }
  return value as Record<string, unknown>;
}

function validateTransaction(value: unknown): MercuryTransaction {
  const transaction = asRecord(value, 'Mercury transaction');
  const amount = normalizeAmount(transaction.amount as number | string);
  const currency = transaction.currency;
  if (
    currency != null &&
    (typeof currency !== 'string' || currency.toUpperCase() !== 'USD')
  ) {
    throw new TypeError('Mercury transaction currency is not USD.');
  }
  for (const field of ['direction', 'type'] as const) {
    if (transaction[field] != null && typeof transaction[field] !== 'string') {
      throw new TypeError(`Mercury transaction ${field} is invalid.`);
    }
  }
  return { ...transaction, amount } as MercuryTransaction;
}

function validateTransactionsResponse(
  value: unknown
): MercuryTransactionsResponse & { transactions: MercuryTransaction[] } {
  const response = asRecord(value, 'Mercury transactions response');
  const rawTransactions = response.transactions ?? response.data;
  if (!Array.isArray(rawTransactions)) {
    throw new TypeError('Mercury transactions collection is missing.');
  }
  if (response.nextCursor != null && typeof response.nextCursor !== 'string') {
    throw new TypeError('Mercury transaction cursor is invalid.');
  }
  if (response.hasMore != null && typeof response.hasMore !== 'boolean') {
    throw new TypeError('Mercury transaction pagination state is invalid.');
  }
  return {
    transactions: rawTransactions.map(validateTransaction),
    ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
    ...(typeof response.hasMore === 'boolean'
      ? { hasMore: response.hasMore }
      : {}),
  };
}

function isDebit(transaction: MercuryTransaction, amount: number): boolean {
  const direction = String(
    transaction.direction ?? transaction.type ?? ''
  ).toLowerCase();
  if (direction.includes('debit') || direction.includes('withdrawal')) {
    return true;
  }
  if (direction.includes('credit') || direction.includes('deposit')) {
    return false;
  }
  return amount < 0;
}

// NOTE: Mercury API returns amounts in USD dollars (e.g. 328.92 = $328.92),
// NOT cents. Do not divide by 100.

async function getCheckingBalanceUsd(): Promise<number> {
  const mercuryEnv = getMercuryEnv();
  if (!mercuryEnv) return 0;

  // Mercury's current API uses singular `/account/{id}` (list-all remains
  // `/accounts`). Plural `/accounts/{id}` 404s with errors.notFound.
  const account = await fetchMercury<unknown>(
    `/account/${mercuryEnv.checkingAccountId}`
  );
  const accountRecord = asRecord(account, 'Mercury account response');
  const rawBalance =
    accountRecord.availableBalance ??
    accountRecord.currentBalance ??
    accountRecord.balance;
  const balanceUsd = Number(rawBalance);
  if (rawBalance == null || !Number.isFinite(balanceUsd)) {
    throw new TypeError('Mercury account balance is missing or invalid.');
  }
  return balanceUsd;
}

async function getCheckingTransactions(
  startDate: Date,
  endDate: Date
): Promise<MercuryTransaction[]> {
  const mercuryEnv = getMercuryEnv();
  if (!mercuryEnv) return [];

  const transactions: MercuryTransaction[] = [];
  let cursor: string | undefined;
  // Safety guard: cap pagination to avoid unbounded iteration if Mercury
  // returns unexpectedly many pages (each request has its own 8s timeout).
  const MAX_PAGES = 20;
  let pageCount = 0;

  for (;;) {
    if (pageCount >= MAX_PAGES) break;
    pageCount++;

    const response = validateTransactionsResponse(
      await fetchMercury<unknown>(
        `/account/${mercuryEnv.checkingAccountId}/transactions`,
        {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          ...(cursor ? { cursor } : {}),
        }
      )
    );

    transactions.push(...response.transactions);

    if (!response.nextCursor && !response.hasMore) {
      break;
    }
    if (!response.nextCursor) {
      throw new TypeError(
        'Mercury transaction pagination is incomplete: next cursor missing.'
      );
    }
    if (pageCount >= MAX_PAGES) {
      throw new TypeError(
        `Mercury transaction pagination exceeded ${MAX_PAGES} pages.`
      );
    }
    if (response.nextCursor === cursor) {
      throw new TypeError('Mercury transaction pagination cursor repeated.');
    }
    cursor = response.nextCursor;
  }

  return transactions;
}

async function loadAdminMercuryMetrics(): Promise<AdminMercuryMetrics> {
  const mercuryEnv = getMercuryEnv();

  if (!mercuryEnv) {
    return buildUnconfiguredResponse();
  }

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * MS_PER_DAY);

    // Fetch balance first — it's fast and most important for the HUD.
    const balanceUsd = await getCheckingBalanceUsd();

    // Transactions can be slow (30-day pagination). Preserve the accurate
    // balance when they time out, but never present missing burn as measured
    // zero or use it to calculate company survival.
    let burnRateUsd = 0;
    let burnRateAvailable = true;
    let burnErrorMessage: string | undefined;
    try {
      const transactions = await getCheckingTransactions(startDate, endDate);
      burnRateUsd = transactions.reduce((total, transaction) => {
        const amount = normalizeAmount(transaction.amount);
        if (!isDebit(transaction, amount)) return total;
        return total + Math.abs(amount);
      }, 0);
    } catch (txError) {
      // Degraded mode: balance is still accurate, but incomplete or malformed
      // transactions must never become measured-zero burn.
      burnRateAvailable = false;
      burnErrorMessage =
        txError instanceof Error ? txError.message : 'Unknown error';
      reportMercuryMetricsErrorOnce(
        txError instanceof ServerFetchTimeoutError
          ? 'Mercury transactions timed out — burn rate unavailable'
          : 'Mercury transactions unavailable — burn rate unavailable',
        txError,
        burnErrorMessage
      );
    }

    return {
      balanceUsd,
      burnRateUsd,
      burnWindowDays: 30,
      burnRateAvailable,
      observedAtIso: new Date().toISOString(),
      isConfigured: true,
      isAvailable: true,
      defaultStatus: burnRateAvailable
        ? computeMercuryDefaultStatus(true, balanceUsd, burnRateUsd)
        : 'unknown',
      ...(burnRateAvailable
        ? {}
        : {
            errorMessage: `Mercury transaction window unavailable: ${burnErrorMessage}.`,
          }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reportMercuryMetricsErrorOnce(
      'Error loading Mercury metrics',
      error,
      message
    );
    return buildErrorResponse(message);
  }
}

export function clearAdminMercuryMetricsCache(): void {
  mercuryMetricsCache.clear();
  lastReportedErrorKey = null;
  lastReportedErrorAt = 0;
}

export async function getAdminMercuryMetrics(): Promise<AdminMercuryMetrics> {
  const now = Date.now();
  const cached = mercuryMetricsCache.get(MERCURY_CACHE_KEY);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const metrics = await loadAdminMercuryMetrics();

  mercuryMetricsCache.set(MERCURY_CACHE_KEY, {
    value: metrics,
    expiresAt: now + CACHE_TTL_MS,
  });

  return metrics;
}
