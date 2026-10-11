import type {
  FinanceAccountContract,
  FinanceBalanceSnapshotContract,
  FinanceCategory,
  FinanceClassificationContract,
  FinanceProvenance,
  FinanceTransactionContract,
  OwnerScopedFinanceRecord,
} from '@/lib/finance/domain-contracts';

export const FINANCE_FIXTURE_OWNER_ID = '10000000-0000-4000-8000-000000000001';
const OBSERVED_AT = '2026-09-30T12:00:00.000Z';

const provenance = (sourceRef: string): FinanceProvenance => ({
  source: 'provider',
  sourceRef,
  syncRunId: 'sync-2026-09-30',
  inputRecordIds: [],
  observedAt: OBSERVED_AT,
});

const base = (id: string): OwnerScopedFinanceRecord => ({
  id,
  ownerUserId: FINANCE_FIXTURE_OWNER_ID,
  createdAt: OBSERVED_AT,
  provenance: provenance(`hash:${id}`),
});

const account = (
  id: string,
  subtype: FinanceAccountContract['subtype'],
  kind: FinanceAccountContract['kind'],
  includeInCash: boolean
): FinanceAccountContract => ({
  ...base(id),
  institutionId: 'institution-mixed',
  kind,
  subtype,
  currency: 'USD',
  includeInCash,
});

const transaction = (
  id: string,
  accountId: string,
  amountMinor: number,
  postedAt: string | null,
  status: FinanceTransactionContract['status'] = 'posted'
): FinanceTransactionContract => ({
  ...base(id),
  accountId,
  status,
  amountMinor,
  currency: 'USD',
  authorizedAt: postedAt,
  postedAt,
});

const classification = (
  transactionId: string,
  category: FinanceCategory,
  confidenceBps = 9_500
): FinanceClassificationContract => ({
  ...base(`class-${transactionId}`),
  transactionId,
  category,
  confidenceBps,
  source: 'owner_rule',
});

interface LinkedFixtureRecord extends OwnerScopedFinanceRecord {
  readonly fromTransactionId: string;
  readonly toTransactionId: string;
}

/** Mixed personal/business accounts plus intentionally irregular creator pay. */
export const MIXED_OWNER_FINANCE_FIXTURE = {
  ownerUserId: FINANCE_FIXTURE_OWNER_ID,
  accounts: [
    account('personal-checking', 'checking', 'asset', true),
    account('creator-checking', 'checking', 'asset', true),
    account('personal-savings', 'savings', 'asset', true),
    account('creator-card', 'credit_card', 'liability', false),
  ],
  balances: [
    {
      ...base('balance-personal'),
      accountId: 'personal-checking',
      asOf: OBSERVED_AT,
      currentMinor: 520_000,
      availableMinor: 500_000,
      currency: 'USD',
    },
    {
      ...base('balance-creator'),
      accountId: 'creator-checking',
      asOf: OBSERVED_AT,
      currentMinor: 340_000,
      availableMinor: 330_000,
      currency: 'USD',
    },
  ] satisfies FinanceBalanceSnapshotContract[],
  transactions: [
    transaction(
      'royalty-jan',
      'creator-checking',
      300_000,
      '2026-01-15T00:00:00.000Z'
    ),
    transaction(
      'royalty-apr',
      'creator-checking',
      120_000,
      '2026-04-15T00:00:00.000Z'
    ),
    transaction(
      'royalty-sep',
      'creator-checking',
      450_000,
      '2026-09-15T00:00:00.000Z'
    ),
    transaction(
      'rent',
      'personal-checking',
      -180_000,
      '2026-09-01T00:00:00.000Z'
    ),
    transaction(
      'annual-daw',
      'creator-card',
      -24_000,
      '2026-09-03T00:00:00.000Z'
    ),
    transaction('camera', 'creator-card', -150_000, '2026-09-05T00:00:00.000Z'),
    transaction(
      'camera-refund',
      'creator-card',
      25_000,
      '2026-09-09T00:00:00.000Z'
    ),
    transaction(
      'save-out',
      'personal-checking',
      -50_000,
      '2026-09-10T00:00:00.000Z'
    ),
    transaction(
      'save-in',
      'personal-savings',
      50_000,
      '2026-09-10T00:00:00.000Z'
    ),
    transaction('pending-show', 'creator-checking', 80_000, null, 'pending'),
  ],
  classifications: [
    classification('royalty-jan', 'creator_income'),
    classification('royalty-apr', 'creator_income'),
    classification('royalty-sep', 'creator_income'),
    classification('rent', 'personal_essential'),
    classification('annual-daw', 'creator_operating'),
    classification('camera', 'creator_investment'),
    classification('camera-refund', 'creator_investment'),
    classification('save-out', 'internal_transfer'),
    classification('save-in', 'internal_transfer'),
    classification('pending-show', 'creator_income', 6_000),
  ],
  links: [
    {
      ...base('transfer-savings'),
      fromTransactionId: 'save-out',
      toTransactionId: 'save-in',
    },
    {
      ...base('refund-camera'),
      fromTransactionId: 'camera-refund',
      toTransactionId: 'camera',
    },
  ] satisfies LinkedFixtureRecord[],
} as const;
