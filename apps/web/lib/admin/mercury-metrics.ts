import 'server-only';

import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

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

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mercuryEnv.apiToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
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

function centsToUsd(amountCents: number): number {
  return amountCents / 100;
}

async function getCheckingBalanceCents(): Promise<number> {
  const mercuryEnv = getMercuryEnv();
  if (!mercuryEnv) return 0;

  const account = await fetchMercury<MercuryAccountResponse>(
    `/accounts/${mercuryEnv.checkingAccountId}`
  );

  const balanceCents = Number(
    account.availableBalance ?? account.currentBalance ?? account.balance ?? 0
  );

  return balanceCents;
}

async function getCheckingTransactionsCents(
  startDate: Date,
  endDate: Date
): Promise<MercuryTransaction[]> {
  const mercuryEnv = getMercuryEnv();
  if (!mercuryEnv) return [];

  const transactions: MercuryTransaction[] = [];
  let cursor: string | undefined;

  for (;;) {
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
      errorMessage:
        'Mercury credentials not configured (set MERCURY_API_TOKEN or MERCURY_API_KEY and MERCURY_CHECKING_ACCOUNT_ID or MERCURY_ACCOUNT_ID)',
    };
  }

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * MS_PER_DAY);

    const [balanceCents, transactions] = await Promise.all([
      getCheckingBalanceCents(),
      getCheckingTransactionsCents(startDate, endDate),
    ]);

    const debitCents = transactions.reduce((total, transaction) => {
      const amount = normalizeAmount(transaction.amount);
      if (Number.isNaN(amount)) return total;
      if (!isDebit(transaction, amount)) return total;
      return total + Math.abs(amount);
    }, 0);

    return {
      balanceUsd: centsToUsd(balanceCents),
      burnRateUsd: centsToUsd(debitCents),
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: true,
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
      errorMessage: `Mercury API error: ${message}`,
    };
  }
}
