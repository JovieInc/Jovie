import type {
  FinanceAccount,
  FinanceTransaction,
} from '@/lib/db/schema/finance';
import { buildMoneyOverview } from '@/lib/finance/metrics';

export const NOW = new Date('2026-09-30T12:00:00.000Z');
export const DAY = 86_400_000;
export const ACTIVE = { status: 'active' };

export function tx(
  over: Omit<Partial<FinanceTransaction>, 'amount'> & {
    daysAgo: number;
    amount: number;
  }
): FinanceTransaction {
  const { daysAgo, amount, ...rest } = over;
  return {
    id: 't',
    ownerUserId: 'u',
    accountId: 'a',
    providerTransactionId: null,
    amount: String(amount),
    currency: 'USD',
    occurredAt: new Date(NOW.getTime() - daysAgo * DAY),
    merchantName: null,
    description: null,
    category: null,
    pending: 'false',
    status: 'posted',
    flowKind: 'unclassified',
    createdAt: NOW,
    ...rest,
  } as FinanceTransaction;
}

export function account(over: Partial<FinanceAccount> = {}): FinanceAccount {
  return {
    id: 'a',
    ownerUserId: 'u',
    institutionId: null,
    providerAccountId: null,
    name: 'Checking',
    accountType: 'checking',
    currency: 'USD',
    currentBalance: '10000',
    availableBalance: null,
    balanceUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as FinanceAccount;
}

export const overview = (transactions: FinanceTransaction[]) =>
  buildMoneyOverview({
    institutions: [ACTIVE],
    accounts: [account()],
    transactions,
    now: NOW,
  });

export const card = (o: ReturnType<typeof buildMoneyOverview>, id: string) =>
  o.cards.find(c => c.id === id)!;
