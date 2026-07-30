import type { BrandDealCommercialCandidate } from '@/lib/connectors/brand-deal-opportunity';

export interface GmailBrandDealEvidence {
  readonly externalObjectId: string;
  readonly payload: {
    readonly subject?: string;
    readonly from?: string;
    readonly date?: string;
    readonly snippet?: string;
  };
}

export interface RankedGmailBrandDealCandidate {
  readonly evidenceObjectId: string;
  readonly candidate: BrandDealCommercialCandidate;
  readonly rankingScore: number;
}

const QUALIFIED_DEAL_RE =
  /\b(?:paid creator campaign|creator-performance campaign|brand partnership|paid partnership|ugc campaign|sponsor(?:ed|ship) campaign)\b/i;
const CURRENT_BRIEF_RE =
  /\b(?:current|this|proposed)\b[^\n]{0,48}\b(?:campaign|brief|deal|offer)\b/i;
const HISTORICAL_BRIEF_RE =
  /\b(?:previous|past|last|completed)\s+(?:campaign|brief|deal|offer)\b|\b(?:campaign|deal)\s+(?:recap|summary)\b/i;
const FORBIDDEN_ADJACENCY_RE =
  /\b(?:newsletter|gift(?:ing|ed)?|product seeding|affiliate|a7x3|creator economy|influencer activation)\b/i;
const FORBIDDEN_TERMS_RE =
  /\b(?:perpetual|irrevocable|unlimited revisions?|broad exclusivity|all[- ]category exclusivity)\b/i;
const COMPANY_RE = /\b(?:company|brand)\s*:\s*([^.;\n]{2,80})/i;
const BUDGET_RE =
  /\b(?:budget|fee|offer|rate)\s*(?:is|:|of)?\s*\$([\d,.]+)\s*(k)?(?:\s*(?:-|to)\s*\$?([\d,.]+)\s*(k)?)?/i;
const DEPOSIT_PERCENT_RE =
  /(?:\b(\d{2,3})%\s*(?:deposit|upfront)\b|\b(?:deposit|upfront)\s*(?:is|:|of)?\s*(\d{2,3})%)/i;
const USAGE_TERM_RE = /\b(\d{1,3})[- ]day\s+([a-z ]{0,24})usage\b/i;
const NO_EXCLUSIVITY_RE = /\bno\s+exclusivity\b/i;
const REVISION_RE = /\b(no|zero|0|one|1)\s+(?:included\s+)?revisions?\b/i;
const SENDER_NAME_RE = /^"?([^"<@]+?)"?\s*</;
const NON_BUYER_SENDER_RE =
  /\b(?:no[- ]?reply|newsletter|marketing|support|team|bookings?|info)\b/i;
const MAX_MESSAGE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function parseMoneyCents(raw: string, suffix: string | undefined): number {
  const numeric = Number.parseFloat(raw.replaceAll(',', ''));
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.round(numeric * (suffix?.toLowerCase() === 'k' ? 100_000 : 100));
}

function parseBuyerName(from: string): string | null {
  const name = from.match(SENDER_NAME_RE)?.[1]?.trim();
  if (!name || name.length < 2 || NON_BUYER_SENDER_RE.test(name)) return null;
  return name;
}

function parseCompany(text: string): string | null {
  const company = text.match(COMPANY_RE)?.[1]?.trim();
  if (!company || company.length < 2) return null;
  return company;
}

function parseBudget(
  text: string
): { readonly minimum: number; readonly maximum: number } | null {
  const match = text.match(BUDGET_RE);
  if (!match?.[1]) return null;

  const minimum = parseMoneyCents(match[1], match[2]);
  const maximum = match[3]
    ? parseMoneyCents(match[3], match[4] ?? match[2])
    : minimum;
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum > maximum ||
    minimum < 750_000 ||
    maximum > 1_250_000
  ) {
    return null;
  }

  return { minimum, maximum };
}

function parseDepositPercent(text: string): number | null {
  if (/\bhalf\s+(?:deposit|upfront)\b/i.test(text)) return 50;
  const match = text.match(DEPOSIT_PERCENT_RE);
  const percent = Number.parseInt(match?.[1] ?? match?.[2] ?? '', 10);
  return Number.isInteger(percent) && percent >= 50 && percent <= 100
    ? percent
    : null;
}

function parseUsageTermDays(text: string): number | null {
  const days = Number.parseInt(text.match(USAGE_TERM_RE)?.[1] ?? '', 10);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
}

function parseIncludedRevisions(text: string): 0 | 1 | null {
  const raw = text.match(REVISION_RE)?.[1]?.toLowerCase();
  if (raw === 'no' || raw === 'zero' || raw === '0') return 0;
  if (raw === 'one' || raw === '1') return 1;
  return null;
}

function hasFreshMessageDate(rawDate: string | undefined): boolean {
  const messageDate = Date.parse(rawDate ?? '');
  if (!Number.isFinite(messageDate)) return false;
  const now = Date.now();
  return (
    messageDate >= now - MAX_MESSAGE_AGE_MS &&
    messageDate <= now + MAX_FUTURE_SKEW_MS
  );
}

function rankingScore(
  candidate: BrandDealCommercialCandidate,
  expectedUpfrontCashCents: number
): number {
  return (
    ((expectedUpfrontCashCents / 100) *
      candidate.closeProbability *
      candidate.repeatPotential) /
    candidate.creatorMinutes
  );
}

export function extractGmailBrandDealCandidate(
  evidence: GmailBrandDealEvidence
): RankedGmailBrandDealCandidate | null {
  const subject = evidence.payload.subject?.trim() ?? '';
  const snippet = evidence.payload.snippet?.trim() ?? '';
  const text = `${subject}\n${snippet}`;

  if (
    !QUALIFIED_DEAL_RE.test(text) ||
    !CURRENT_BRIEF_RE.test(text) ||
    HISTORICAL_BRIEF_RE.test(text) ||
    FORBIDDEN_ADJACENCY_RE.test(text) ||
    FORBIDDEN_TERMS_RE.test(text) ||
    !hasFreshMessageDate(evidence.payload.date)
  ) {
    return null;
  }

  const buyerName = parseBuyerName(evidence.payload.from ?? '');
  const buyerCompany = parseCompany(text);
  const budget = parseBudget(text);
  const depositPercent = parseDepositPercent(text);
  const usageTermDays = parseUsageTermDays(text);
  const includedRevisions = parseIncludedRevisions(text);
  if (
    !buyerName ||
    !buyerCompany ||
    !budget ||
    depositPercent === null ||
    usageTermDays === null ||
    includedRevisions === null ||
    !NO_EXCLUSIVITY_RE.test(text)
  ) {
    return null;
  }

  const candidate: BrandDealCommercialCandidate = {
    buyerName,
    buyerCompany,
    budgetMinCents: budget.minimum,
    budgetMaxCents: budget.maximum,
    depositPercent,
    includedRevisions,
    usageTermDays,
    exclusivity: 'none',
    closeProbability: 0.5,
    repeatPotential: 1,
    creatorMinutes: 60,
  };
  const expectedUpfrontCashCents = Math.round(
    (budget.minimum * depositPercent) / 100
  );

  return {
    evidenceObjectId: evidence.externalObjectId,
    candidate,
    rankingScore: rankingScore(candidate, expectedUpfrontCashCents),
  };
}

export function selectHighestRankedGmailBrandDealCandidate(
  evidence: readonly GmailBrandDealEvidence[],
  excludedEvidenceObjectIds: ReadonlySet<string> = new Set()
): RankedGmailBrandDealCandidate | null {
  return (
    evidence
      .filter(item => !excludedEvidenceObjectIds.has(item.externalObjectId))
      .map(extractGmailBrandDealCandidate)
      .filter(
        (candidate): candidate is RankedGmailBrandDealCandidate =>
          candidate !== null
      )
      .sort((left, right) => right.rankingScore - left.rankingScore)[0] ?? null
  );
}
