import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type MerchCandidateQaReview,
  type MerchDesignOption,
  merchCandidateQaReviews,
  merchDesignOptions,
} from '@/lib/db/schema/merch';
import { getAppFlagValue } from '@/lib/flags/server';
import {
  getMerchContentReviewBlockers,
  readMerchContentReview,
  requiresMerchContentReview,
} from './content-contract';
import { readOptionMockupStatus } from './generation-contract';

/**
 * Pre-publish visual QA gate (JOV-4739, slice 1). Every canonical-pipeline
 * merch candidate gets a persisted, immutable QA-review receipt
 * (merch_candidate_qa_reviews); publish re-checks the LATEST receipt and
 * fails closed on missing or stale evidence (inputHash over the current
 * payload + referenceHash over the contract/reviewer versions in force).
 * `MerchVisualReviewer` is the typed seam a real reviewer lands in later.
 */

export const MERCH_QA_GATE_VERSION = 'merch-qa-gate/v1';
export const MERCH_QA_STUB_REVIEWER_VERSION = 'merch-visual-stub/v0';

export const MERCH_QA_MISSING_RECEIPT_BLOCKER =
  'Merch QA review receipt is missing; the candidate must be reviewed before publishing.';
export const MERCH_QA_REVIEW_UNAVAILABLE_BLOCKER =
  'Merch QA review could not be completed; the candidate cannot be published.';
export const MERCH_QA_FAIL_BLOCKER =
  'Merch QA review failed; the candidate is quarantined and cannot be published.';
export const MERCH_QA_BORDERLINE_BLOCKER =
  'Merch QA review is borderline; the candidate is quarantined pending human review.';

export type MerchQaVerdict =
  (typeof merchCandidateQaReviews.verdict.enumValues)[number];
export type MerchQaSeverity =
  (typeof merchCandidateQaReviews.severity.enumValues)[number];
export type MerchQaDisposition =
  (typeof merchCandidateQaReviews.disposition.enumValues)[number];

const VERDICT_RANK: Record<MerchQaVerdict, number> = {
  pass: 0,
  borderline: 1,
  fail: 2,
};

const SEVERITY_RANK: Record<MerchQaSeverity, number> = {
  info: 0,
  warning: 1,
  blocker: 2,
};

const QUARANTINE_DISPOSITIONS: readonly MerchQaDisposition[] = [
  'quarantined',
  'escalated',
];

// Reviewer seam — real visual reviewer implements this interface and is
// injected via MerchQaDeps.reviewer. The stub ships the gate fail-closed.

export interface MerchVisualQaInput {
  readonly optionId: string;
  readonly designName: string;
  readonly concept: string;
  readonly productType: string;
  readonly colorway: string;
  readonly placements: readonly string[];
  readonly mockupUrls: readonly string[];
  readonly printFileUrls: readonly string[];
}

export interface MerchVisualQaOutcome {
  readonly verdict: MerchQaVerdict;
  readonly reasonCodes: readonly string[];
  readonly confidence: number;
  readonly severity?: MerchQaSeverity;
  readonly remediationInstruction?: string | null;
  readonly details?: Record<string, unknown>;
}

export interface MerchVisualReviewer {
  readonly version: string;
  review(input: MerchVisualQaInput): Promise<MerchVisualQaOutcome>;
}

export const stubMerchVisualReviewer: MerchVisualReviewer = {
  version: MERCH_QA_STUB_REVIEWER_VERSION,
  review() {
    return Promise.resolve({
      verdict: 'borderline',
      reasonCodes: ['visual_review.unavailable'],
      confidence: 0,
      severity: 'warning',
      remediationInstruction:
        'Visual review is not implemented yet; a human must inspect the mockups before publish.',
    });
  },
};

export interface MerchQaDeps {
  readonly reviewer?: MerchVisualReviewer;
  /** Test/service override — when set, skips the MERCH_QA_GATE flag read. */
  readonly gateEnabled?: boolean;
  /** Stamp onto the receipt when the candidate is already linked to a card. */
  readonly merchCardId?: string | null;
  /** Human remediation note persisted on the receipt. */
  readonly remediationInstruction?: string | null;
}

// Evidence hashing is deterministic over the reviewed payload + the policy
// versions in force, so a candidate edit or reviewer upgrade invalidates it.

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

type MerchQaHashSubject = Pick<
  MerchDesignOption,
  | 'designName'
  | 'concept'
  | 'productType'
  | 'colorway'
  | 'technique'
  | 'placements'
  | 'availableSizes'
  | 'printfulCatalogProductId'
  | 'printfulCatalogVariantIds'
  | 'mockupUrls'
  | 'printFileUrls'
  | 'productionWarnings'
  | 'qualityReview'
>;

export function computeMerchQaInputHash(option: MerchQaHashSubject): string {
  const contentReview = readMerchContentReview(option.qualityReview);
  return sha256(
    stableStringify({
      designName: option.designName,
      concept: option.concept,
      productType: option.productType,
      colorway: option.colorway,
      technique: option.technique,
      placements: [...option.placements].sort(),
      availableSizes: [...option.availableSizes].sort(),
      printfulCatalogProductId: option.printfulCatalogProductId,
      printfulCatalogVariantIds: [...option.printfulCatalogVariantIds].sort(
        (a, b) => a - b
      ),
      mockupUrls: [...option.mockupUrls].sort(),
      printFileUrls: [...option.printFileUrls].sort(),
      productionWarnings: [...option.productionWarnings].sort(),
      mockupStatus: readOptionMockupStatus(option.qualityReview),
      contentReview,
    })
  );
}

export function computeMerchQaReferenceHash(
  option: Pick<MerchDesignOption, 'qualityReview'>,
  reviewerVersion: string
): string {
  const contentReview = readMerchContentReview(option.qualityReview);
  return sha256(
    stableStringify({
      gateVersion: MERCH_QA_GATE_VERSION,
      reviewerVersion,
      generationContractVersion: option.qualityReview?.contractVersion ?? null,
      contentContractVersion: contentReview?.contractVersion ?? null,
    })
  );
}

export function isMerchQaReceiptFresh(
  receipt: Pick<MerchCandidateQaReview, 'inputHash' | 'referenceHash'>,
  option: MerchQaHashSubject,
  reviewerVersion: string
): boolean {
  return (
    receipt.inputHash === computeMerchQaInputHash(option) &&
    receipt.referenceHash ===
      computeMerchQaReferenceHash(option, reviewerVersion)
  );
}

// Gate scope mirrors the content-review convention (JOV-4740): only
// canonical-pipeline candidates are gated; legacy rows keep prior behavior.

export function requiresMerchQaReview(
  option: Pick<MerchDesignOption, 'qualityReview'>
): boolean {
  return requiresMerchContentReview(option.qualityReview);
}

export async function isMerchQaGateEnabled(
  deps?: Pick<MerchQaDeps, 'gateEnabled'>
): Promise<boolean> {
  if (deps?.gateEnabled !== undefined) return deps.gateEnabled;
  try {
    return await getAppFlagValue('MERCH_QA_GATE', { userId: null });
  } catch {
    // Flag resolution failure must never publish-gate: treat as off.
    return false;
  }
}

// Review orchestration: deterministic checks + the reviewer seam, persisted
// as an immutable receipt; prior receipts flip to 'superseded'.

function dispositionForVerdict(verdict: MerchQaVerdict): MerchQaDisposition {
  if (verdict === 'fail') return 'quarantined';
  if (verdict === 'borderline') return 'escalated';
  return 'cleared';
}

export function evaluateMerchQaVerdict(
  verdict: MerchQaVerdict,
  reasonCodes: readonly string[]
): string[] {
  if (verdict === 'fail') {
    return [
      MERCH_QA_FAIL_BLOCKER,
      ...reasonCodes.map(code => `QA reason: ${code}`),
    ];
  }
  if (verdict === 'borderline') {
    return [MERCH_QA_BORDERLINE_BLOCKER];
  }
  return [];
}

export async function getLatestMerchQaReceipt(
  designOptionId: string
): Promise<MerchCandidateQaReview | null> {
  const [receipt] = await db
    .select()
    .from(merchCandidateQaReviews)
    .where(eq(merchCandidateQaReviews.designOptionId, designOptionId))
    .orderBy(desc(merchCandidateQaReviews.createdAt))
    .limit(1);
  return receipt ?? null;
}

function buildVisualQaInput(option: MerchDesignOption): MerchVisualQaInput {
  return {
    optionId: option.id,
    designName: option.designName,
    concept: option.concept,
    productType: option.productType,
    colorway: option.colorway,
    placements: option.placements,
    mockupUrls: option.mockupUrls,
    printFileUrls: option.printFileUrls,
  };
}

export async function runMerchCandidateQa(
  option: MerchDesignOption,
  deps?: MerchQaDeps
): Promise<MerchCandidateQaReview> {
  const reviewer = deps?.reviewer ?? stubMerchVisualReviewer;
  const reasonCodes = new Set<string>();
  let verdict: MerchQaVerdict = 'pass';
  let severity: MerchQaSeverity = 'info';
  let confidence = 1;
  const details: Record<string, unknown> = {};
  let remediationInstruction = deps?.remediationInstruction ?? null;

  const bump = (next: MerchQaVerdict, nextSeverity: MerchQaSeverity) => {
    if (VERDICT_RANK[next] > VERDICT_RANK[verdict]) verdict = next;
    if (SEVERITY_RANK[nextSeverity] > SEVERITY_RANK[severity]) {
      severity = nextSeverity;
    }
  };

  // Deterministic checks — content contract + truthful-mockup lifecycle.
  const contentBlockers = getMerchContentReviewBlockers(option.qualityReview);
  if (contentBlockers.length > 0) {
    bump('fail', 'blocker');
    reasonCodes.add('content.review_blocked');
    const contentReview = readMerchContentReview(option.qualityReview);
    for (const code of contentReview?.failureCodes ?? []) {
      reasonCodes.add(code);
    }
    details.contentBlockers = contentBlockers;
  }
  const mockupStatus = readOptionMockupStatus(option.qualityReview);
  if (mockupStatus === 'mockup_failed') {
    bump('fail', 'blocker');
    reasonCodes.add('mockup.failed');
  } else if (mockupStatus === 'pending_mockup') {
    bump('borderline', 'warning');
    reasonCodes.add('mockup.pending');
  }
  if (option.productionWarnings.length > 0) {
    bump('borderline', 'warning');
    reasonCodes.add('production.warnings');
    details.productionWarnings = [...option.productionWarnings];
  }

  const visual = await reviewer.review(buildVisualQaInput(option));
  bump(visual.verdict, visual.severity ?? 'warning');
  for (const code of visual.reasonCodes) reasonCodes.add(code);
  confidence = Math.min(confidence, visual.confidence);
  remediationInstruction =
    visual.remediationInstruction ?? remediationInstruction;
  details.visual = {
    reviewerVersion: reviewer.version,
    ...(visual.details ?? {}),
  };

  const priorReceipts = await db
    .select({ id: merchCandidateQaReviews.id })
    .from(merchCandidateQaReviews)
    .where(eq(merchCandidateQaReviews.designOptionId, option.id));

  if (priorReceipts.length > 0) {
    await db
      .update(merchCandidateQaReviews)
      .set({ disposition: 'superseded' })
      .where(
        and(
          eq(merchCandidateQaReviews.designOptionId, option.id),
          ne(merchCandidateQaReviews.disposition, 'superseded')
        )
      );
  }

  const [receipt] = await db
    .insert(merchCandidateQaReviews)
    .values({
      designOptionId: option.id,
      merchCardId: deps?.merchCardId ?? null,
      creatorProfileId: option.creatorProfileId,
      verdict,
      severity,
      reasonCodes: [...reasonCodes],
      reviewerVersion: reviewer.version,
      confidence,
      inputHash: computeMerchQaInputHash(option),
      referenceHash: computeMerchQaReferenceHash(option, reviewer.version),
      retryCount: priorReceipts.length,
      remediationInstruction,
      disposition: dispositionForVerdict(verdict),
      details,
      reviewedAt: new Date(),
    })
    .returning();

  // Quarantine non-passing candidates; release quarantined candidates that now
  // pass. Selected/rejected rows are not touched — receipts carry the truth.
  if (verdict !== 'pass' && option.status === 'candidate') {
    await db
      .update(merchDesignOptions)
      .set({ status: 'quarantined', updatedAt: new Date() })
      .where(eq(merchDesignOptions.id, option.id));
  } else if (verdict === 'pass' && option.status === 'quarantined') {
    await db
      .update(merchDesignOptions)
      .set({ status: 'candidate', updatedAt: new Date() })
      .where(eq(merchDesignOptions.id, option.id));
  }

  return receipt;
}

/**
 * Load the latest receipt when it still matches the candidate's current
 * payload; otherwise run a fresh review and persist the new receipt.
 * Fail-closed: a reviewer error bubbles as a missing-evidence blocker.
 */
export async function ensureMerchQaReceipt(
  option: MerchDesignOption,
  deps?: MerchQaDeps
): Promise<{ receipt: MerchCandidateQaReview | null; stale: boolean }> {
  const reviewer = deps?.reviewer ?? stubMerchVisualReviewer;
  const latest = await getLatestMerchQaReceipt(option.id);
  const fresh =
    latest != null && isMerchQaReceiptFresh(latest, option, reviewer.version);
  if (fresh) return { receipt: latest, stale: false };

  try {
    const receipt = await runMerchCandidateQa(option, deps);
    return { receipt, stale: latest != null };
  } catch {
    return { receipt: null, stale: latest != null };
  }
}

/** Publish gate: blockers for a candidate, fail-closed on missing evidence. */
export async function getMerchQaPublishBlockers(
  option: MerchDesignOption,
  deps?: MerchQaDeps
): Promise<string[]> {
  if (!(await isMerchQaGateEnabled(deps))) return [];
  if (!requiresMerchQaReview(option)) return [];

  const { receipt, stale } = await ensureMerchQaReceipt(option, deps);
  if (!receipt) {
    return [
      stale
        ? MERCH_QA_REVIEW_UNAVAILABLE_BLOCKER
        : MERCH_QA_MISSING_RECEIPT_BLOCKER,
    ];
  }
  return evaluateMerchQaVerdict(receipt.verdict, receipt.reasonCodes);
}

/**
 * Selection gate: a candidate whose latest receipt is FAIL can never be
 * selected/published, even by direct service calls. Borderline candidates may
 * be selected into drafts but stay quarantined pending human review.
 */
export async function assertMerchCandidateSelectable(
  option: MerchDesignOption,
  deps?: MerchQaDeps
): Promise<void> {
  if (!(await isMerchQaGateEnabled(deps))) return;
  if (!requiresMerchQaReview(option)) return;

  const { receipt } = await ensureMerchQaReceipt(option, deps);
  if (receipt?.verdict === 'fail') {
    throw new Error(MERCH_QA_FAIL_BLOCKER);
  }
}

/**
 * Card-level publish gate for publishMerchCard / updateMerchCardDetails /
 * updateMerchCardStatus. Grandfathers cards already published once and cards
 * with no linked design option (legacy/manual rows).
 */
export async function assertMerchQaPublishableForCard(
  card: {
    readonly selectedDesignOptionId: string | null;
    readonly publishedAt: Date | null;
  },
  deps?: MerchQaDeps
): Promise<void> {
  if (!(await isMerchQaGateEnabled(deps))) return;
  if (!card.selectedDesignOptionId) return;
  if (card.publishedAt != null) return;

  const [option] = await db
    .select()
    .from(merchDesignOptions)
    .where(eq(merchDesignOptions.id, card.selectedDesignOptionId))
    .limit(1);
  if (!option) return;

  const blockers = await getMerchQaPublishBlockers(option, deps);
  if (blockers.length > 0) {
    throw new Error(`Merch card cannot be published: ${blockers.join(' ')}`);
  }
}

// Quarantine queue + targeted remediation.

export interface MerchQuarantinedCandidate {
  readonly option: MerchDesignOption;
  readonly receipt: MerchCandidateQaReview;
  /** Borderline candidates are routed here for human review. */
  readonly needsHumanReview: boolean;
}

export async function listMerchQaQuarantine(
  profileId: string
): Promise<MerchQuarantinedCandidate[]> {
  const receipts = await db
    .select()
    .from(merchCandidateQaReviews)
    .where(
      and(
        eq(merchCandidateQaReviews.creatorProfileId, profileId),
        inArray(merchCandidateQaReviews.disposition, [
          ...QUARANTINE_DISPOSITIONS,
        ])
      )
    )
    .orderBy(desc(merchCandidateQaReviews.createdAt));

  const latestByOption = new Map<string, MerchCandidateQaReview>();
  for (const receipt of receipts) {
    if (!latestByOption.has(receipt.designOptionId)) {
      latestByOption.set(receipt.designOptionId, receipt);
    }
  }
  if (latestByOption.size === 0) return [];

  const options = await db
    .select()
    .from(merchDesignOptions)
    .where(inArray(merchDesignOptions.id, [...latestByOption.keys()]));
  const optionById = new Map(options.map(option => [option.id, option]));

  return [...latestByOption.entries()].flatMap(([optionId, receipt]) => {
    const option = optionById.get(optionId);
    if (!option) return [];
    return [
      {
        option,
        receipt,
        needsHumanReview: receipt.disposition === 'escalated',
      },
    ];
  });
}

/**
 * Targeted-remediation retry: clone a quarantined candidate into a fresh
 * candidate carrying the remediation instruction. The new row is stamped with
 * the generation contract so the gate reviews it on next selection/publish.
 */
export async function createMerchRemediationCandidate(params: {
  readonly option: MerchDesignOption;
  readonly instruction: string;
  readonly createdByClerkUserId: string;
}): Promise<MerchDesignOption> {
  const { option, instruction } = params;
  const siblings = await db
    .select({ optionNumber: merchDesignOptions.optionNumber })
    .from(merchDesignOptions)
    .where(eq(merchDesignOptions.generationBatchId, option.generationBatchId));
  const optionNumber =
    Math.max(0, ...siblings.map(sibling => sibling.optionNumber)) + 1;

  const [candidate] = await db
    .insert(merchDesignOptions)
    .values({
      generationBatchId: option.generationBatchId,
      creatorProfileId: option.creatorProfileId,
      optionNumber,
      status: 'candidate',
      designLane: option.designLane,
      designName: option.designName,
      productType: option.productType,
      printfulProductName: option.printfulProductName,
      printfulCatalogProductId: option.printfulCatalogProductId,
      printfulCatalogVariantIds: option.printfulCatalogVariantIds,
      variantMap: option.variantMap,
      colorway: option.colorway,
      availableSizes: option.availableSizes,
      placements: option.placements,
      technique: option.technique,
      retailPriceCents: option.retailPriceCents,
      estimatedPrintfulProductCostCents:
        option.estimatedPrintfulProductCostCents,
      estimatedShippingCostCents: option.estimatedShippingCostCents,
      estimatedGrossMarginCents: option.estimatedGrossMarginCents,
      artistShareCents: option.artistShareCents,
      jovieShareCents: option.jovieShareCents,
      pricing: option.pricing,
      concept: option.concept,
      whyItFits: option.whyItFits,
      mockupUrls: option.mockupUrls,
      printFileUrls: option.printFileUrls,
      productionWarnings: [],
      qualityReview: option.qualityReview,
      learning: option.learning,
      remediationOfOptionId: option.id,
      remediationInstruction: instruction,
    })
    .returning();
  return candidate;
}
