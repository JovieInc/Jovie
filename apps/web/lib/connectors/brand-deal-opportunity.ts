export const BRAND_DEAL_OPPORTUNITY_KIND = 'brand_deal.opportunity';

export interface BrandDealOpportunityData {
  readonly title: string;
  readonly buyerName: string;
  readonly buyerCompany: string;
  readonly budgetMinCents: number;
  readonly budgetMaxCents: number;
  readonly currency: string;
  readonly sourceLabel: string;
  readonly sourceType:
    | 'personal_email'
    | 'backstage'
    | 'marketplace'
    | 'warm_introduction';
  readonly sourceAccount: string;
  readonly requiredSourceAccount: string;
  readonly sourceReference: string;
  readonly observedAt: string;
  readonly evidenceStatus: 'verified';
  readonly confidence: number;
  readonly identityMatched: true;
  readonly ownershipVerified: true;
  readonly personalDealVerified: true;
  readonly relationshipType:
    | 'past_personal_deal'
    | 'personal_inbound'
    | 'authenticated_marketplace_match'
    | 'verified_warm_introduction';
  readonly rightsSummary: string;
  readonly depositPercent: number;
  readonly activeSponsorCampaignCount: 0;
  readonly includedRevisions: 0 | 1;
  readonly usageTermDays: number;
  readonly exclusivity: 'none' | 'narrow_paid';
  readonly routeToLyb: boolean;
  readonly lybPaidFlowVerified: boolean;
  readonly externalSendApproved: false;
  readonly commercialApprovalId: null;
  readonly expectedUpfrontCashCents: number;
  readonly closeProbability: number;
  readonly repeatPotential: number;
  readonly creatorMinutes: number;
  readonly rankingScore: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isValidObservedAt(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const observedAt = Date.parse(value);
  return (
    Number.isFinite(observedAt) && observedAt <= Date.now() + 5 * 60 * 1000
  );
}

function isVerifiedBackstageReference(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'backstage.com' || hostname.endsWith('.backstage.com');
  } catch {
    return false;
  }
}

function isVerifiedPersonalEmailReference(value: string): boolean {
  return /^gmail:(?:thread|message):[0-9a-f]+$/i.test(value.trim());
}

const PERSONAL_RELATIONSHIP_TYPES = new Set<
  BrandDealOpportunityData['relationshipType']
>([
  'past_personal_deal',
  'personal_inbound',
  'authenticated_marketplace_match',
  'verified_warm_introduction',
]);

const VERIFIED_SOURCE_TYPES = new Set<BrandDealOpportunityData['sourceType']>([
  'personal_email',
  'backstage',
  'marketplace',
  'warm_introduction',
]);

export function parseBrandDealOpportunity(
  kind: string,
  payload: unknown
): BrandDealOpportunityData | null {
  if (kind !== BRAND_DEAL_OPPORTUNITY_KIND) return null;
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.title) ||
    !isNonEmptyString(candidate.buyerName) ||
    !isNonEmptyString(candidate.buyerCompany) ||
    !isFiniteNonNegativeNumber(candidate.budgetMinCents) ||
    !isFiniteNonNegativeNumber(candidate.budgetMaxCents) ||
    candidate.budgetMinCents > candidate.budgetMaxCents ||
    candidate.budgetMinCents < 750_000 ||
    candidate.budgetMaxCents > 1_250_000 ||
    !isNonEmptyString(candidate.currency) ||
    candidate.currency.toUpperCase() !== 'USD' ||
    !isNonEmptyString(candidate.sourceLabel) ||
    !VERIFIED_SOURCE_TYPES.has(
      candidate.sourceType as BrandDealOpportunityData['sourceType']
    ) ||
    !isNonEmptyString(candidate.sourceAccount) ||
    !isNonEmptyString(candidate.requiredSourceAccount) ||
    candidate.sourceAccount.trim().toLowerCase() !==
      candidate.requiredSourceAccount.trim().toLowerCase() ||
    !isNonEmptyString(candidate.sourceReference) ||
    !isValidObservedAt(candidate.observedAt) ||
    !isFiniteNonNegativeNumber(candidate.confidence) ||
    candidate.confidence < 0.9 ||
    candidate.confidence > 1 ||
    (candidate.sourceType === 'backstage' &&
      !isVerifiedBackstageReference(candidate.sourceReference)) ||
    (candidate.sourceType === 'personal_email' &&
      !isVerifiedPersonalEmailReference(candidate.sourceReference)) ||
    candidate.evidenceStatus !== 'verified' ||
    candidate.identityMatched !== true ||
    candidate.ownershipVerified !== true ||
    candidate.personalDealVerified !== true ||
    !PERSONAL_RELATIONSHIP_TYPES.has(
      candidate.relationshipType as BrandDealOpportunityData['relationshipType']
    ) ||
    !isNonEmptyString(candidate.rightsSummary) ||
    !isIntegerInRange(candidate.depositPercent, 50, 100) ||
    candidate.activeSponsorCampaignCount !== 0 ||
    !isIntegerInRange(candidate.includedRevisions, 0, 1) ||
    !isIntegerInRange(candidate.usageTermDays, 1, 90) ||
    (candidate.exclusivity !== 'none' &&
      candidate.exclusivity !== 'narrow_paid') ||
    typeof candidate.routeToLyb !== 'boolean' ||
    typeof candidate.lybPaidFlowVerified !== 'boolean' ||
    (candidate.routeToLyb === true && candidate.lybPaidFlowVerified !== true) ||
    candidate.externalSendApproved !== false ||
    candidate.commercialApprovalId !== null ||
    !isFiniteNonNegativeNumber(candidate.expectedUpfrontCashCents) ||
    candidate.expectedUpfrontCashCents <
      (candidate.budgetMinCents * candidate.depositPercent) / 100 ||
    candidate.expectedUpfrontCashCents > candidate.budgetMaxCents ||
    !isFiniteNonNegativeNumber(candidate.closeProbability) ||
    candidate.closeProbability > 1 ||
    !isFiniteNonNegativeNumber(candidate.repeatPotential) ||
    !isFiniteNonNegativeNumber(candidate.creatorMinutes) ||
    candidate.creatorMinutes <= 0
  ) {
    return null;
  }

  const rankingScore =
    ((candidate.expectedUpfrontCashCents / 100) *
      candidate.closeProbability *
      candidate.repeatPotential) /
    candidate.creatorMinutes;

  return {
    ...(candidate as unknown as Omit<BrandDealOpportunityData, 'rankingScore'>),
    rankingScore,
  };
}

function formatCompactMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  const formatted =
    amount >= 1000
      ? `${new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 1,
        }).format(amount / 1000)}k`
      : new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 0,
        }).format(amount);
  return currency.toUpperCase() === 'USD'
    ? `$${formatted}`
    : `${formatted} ${currency}`;
}

export function formatBrandDealOpportunityMetadata(
  deal: BrandDealOpportunityData
): string {
  const budget =
    deal.budgetMinCents === deal.budgetMaxCents
      ? formatCompactMoney(deal.budgetMinCents, deal.currency)
      : `${formatCompactMoney(deal.budgetMinCents, deal.currency)}-${formatCompactMoney(deal.budgetMaxCents, deal.currency)}`;
  return `${budget} · ${deal.buyerName} @ ${deal.buyerCompany} · ${deal.sourceLabel} · verified · score ${deal.rankingScore.toFixed(1)} · ${deal.rightsSummary}`;
}
