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

interface MercuryEnv {
  apiToken: string;
  checkingAccountId: string;
}

interface MercuryAccountResponse {
  availableBalance?: number;
  currentBalance?: number;
  balance?: number;
  accountNumber?: string;
  name?: string;
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
    throw new Error(`Mercury API error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

function normalizeAmount(amount: MercuryTransaction['amount']): number {
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') return Number(amount);
  return 0;
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

  const account = await fetchMercury<MercuryAccountResponse>(
    `/accounts/${mercuryEnv.checkingAccountId}`
  );

  const balanceUsd = Number(
    account.availableBalance ?? account.currentBalance ?? account.balance ?? 0
  );

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

    const response = await fetchMercury<MercuryTransactionsResponse>(
      `/accounts/${mercuryEnv.checkingAccountId}/transactions`,
      {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        ...(cursor ? { cursor } : {}),
      }
    );

    const page = response.transactions ?? response.data ?? [];
    transactions.push(...page);

    if (!response.nextCursor && !response.hasMore) {
      break;
    }

    if (response.nextCursor) {
      cursor = response.nextCursor;
    } else {
      break;
    }
  }

  return transactions;
}

export async function getAdminMercuryMetrics(): Promise<AdminMercuryMetrics> {
  const mercuryEnv = getMercuryEnv();

  if (!mercuryEnv) {
    return {
      balanceUsd: 0,
      burnRateUsd: 0,
      burnWindowDays: 30,
      isConfigured: false,
      isAvailable: false,
      defaultStatus: 'unknown',
      errorMessage:
        'Mercury credentials not configured (set MERCURY_API_TOKEN or MERCURY_API_KEY and MERCURY_CHECKING_ACCOUNT_ID or MERCURY_ACCOUNT_ID)',
    };
  }

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * MS_PER_DAY);

    // Fetch balance first — it's fast and most important for the HUD.
    const balanceUsd = await getCheckingBalanceUsd();

    // Transactions can be slow (30-day pagination). If they time out, degrade
    // gracefully: show the balance as available with burnRateUsd=0 rather than
    // marking Mercury as unavailable entirely.
    let burnRateUsd = 0;
    try {
      const transactions = await getCheckingTransactions(startDate, endDate);
      burnRateUsd = transactions.reduce((total, transaction) => {
        const amount = normalizeAmount(transaction.amount);
        if (Number.isNaN(amount)) return total;
        if (!isDebit(transaction, amount)) return total;
        return total + Math.abs(amount);
      }, 0);
    } catch (txError) {
      if (txError instanceof ServerFetchTimeoutError) {
        // Degraded mode: balance is still accurate, burn rate unavailable.
        captureError(
          'Mercury transactions timed out — burn rate unavailable',
          txError
        );
      } else {
        // Re-throw non-timeout errors so the outer catch handles them.
        throw txError;
      }
    }

    return {
      balanceUsd,
      burnRateUsd,
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: true,
      defaultStatus: computeMercuryDefaultStatus(true, balanceUsd, burnRateUsd),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    captureError('Error loading Mercury metrics', error);
    return {
      balanceUsd: 0,
      burnRateUsd: 0,
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: false,
      defaultStatus: 'unknown',
      errorMessage: `Mercury API error: ${message}`,
    };
  }
}
