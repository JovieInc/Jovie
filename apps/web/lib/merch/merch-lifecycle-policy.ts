import {
  type LibraryRemovalPolicy,
  resolveLibraryRemovalPolicy,
} from '@/lib/library/lifecycle-policy';

export interface MerchLifecyclePolicyInput {
  readonly status:
    | 'draft'
    | 'live'
    | 'paused'
    | 'archived'
    | 'sold_out'
    | 'failed';
  readonly publishedAt?: Date | string | null;
  readonly views?: number | null;
  readonly clicks?: number | null;
  readonly addToCarts?: number | null;
  readonly purchases?: number | null;
  readonly grossRevenueCents?: number | null;
}

function isPositive(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > 0;
}

export function resolveMerchRemovalPolicy(
  merch: MerchLifecyclePolicyInput
): LibraryRemovalPolicy {
  const hasBeenPublished =
    merch.publishedAt != null ||
    merch.status === 'live' ||
    merch.status === 'paused' ||
    merch.status === 'sold_out' ||
    merch.status === 'archived';
  const hasAnalytics = [
    merch.views,
    merch.clicks,
    merch.addToCarts,
    merch.purchases,
    merch.grossRevenueCents,
  ].some(isPositive);

  return resolveLibraryRemovalPolicy({
    itemKind: 'merch',
    isDraftOrNeverPublished: merch.status === 'draft' && !hasBeenPublished,
    hasBeenPublished,
    hasAnalytics,
  });
}

export function isMerchArchived(merch: {
  readonly status: MerchLifecyclePolicyInput['status'];
  readonly archivedAt?: Date | string | null;
}): boolean {
  return merch.status === 'archived' || merch.archivedAt != null;
}
