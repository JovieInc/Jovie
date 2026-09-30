import { z } from 'zod';
import { getMarketingSectionRegistryEntry } from '../componentRegistry';
import {
  getProposedSectionEvidence,
  SECTION_REQUEST_GOVERNANCE,
} from '../designGaps';
import { LANDING_PAGE_FAMILIES } from '../landingPageGrammar';
import {
  getMarketingSection,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
} from '../sections';

export const SectionContentShapeSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative()
);
export type SectionContentShape = z.infer<typeof SectionContentShapeSchema>;

export const SectionJobNeedSchema = z.object({
  job: z.string().trim().min(1),
  /** Character counts keyed by the canonical content-budget slot name. */
  contentShape: SectionContentShapeSchema,
  mediaNeed: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
});
export type SectionJobNeed = z.infer<typeof SectionJobNeedSchema>;

export const SectionRequestSchema = z.object({
  job: z.string().trim().min(1),
  contentShape: z.string().trim().min(1),
  mediaNeed: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
  dedupeKey: z.string().min(1),
});
export type SectionRequest = z.infer<typeof SectionRequestSchema>;

interface GapFinding {
  readonly need: SectionJobNeed;
  readonly evidence: readonly string[];
}

const normalizedToken = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

const normalizedSlot = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-');

function isMarketingSectionId(value: string): value is MarketingSectionId {
  return MARKETING_SECTION_IDS.includes(value as MarketingSectionId);
}

function candidateSectionIds(
  job: string,
  registryIds: readonly string[]
): readonly MarketingSectionId[] {
  const normalizedJob = normalizedToken(job);
  if (isMarketingSectionId(normalizedJob)) {
    const exactRegistryId = `section.${normalizedJob}`;
    if (registryIds.includes(exactRegistryId)) return [normalizedJob];
  }
  return registryIds.flatMap(registryId => {
    if (!registryId.startsWith('section.')) return [];
    const sectionId = registryId.slice('section.'.length);
    return isMarketingSectionId(sectionId) ? [sectionId] : [];
  });
}

function contentBudgetEvidence(
  sectionId: MarketingSectionId,
  contentShape: SectionContentShape
): readonly string[] {
  const section = getMarketingSection(sectionId);
  return Object.entries(contentShape).flatMap(([slot, count]) => {
    const budget = section.contentBudgets.find(
      candidate => normalizedSlot(candidate.slot) === normalizedSlot(slot)
    );
    if (!budget) {
      return [`section.${sectionId} has no certified budget for slot ${slot}`];
    }
    if (count > budget.maxCharsDesktop || count > budget.maxCharsMobile) {
      return [
        `section.${sectionId} ${slot}=${count} exceeds desktop=${budget.maxCharsDesktop} or mobile=${budget.maxCharsMobile}`,
      ];
    }
    return [];
  });
}

function findGap(need: SectionJobNeed): GapFinding | null {
  const normalizedJob = normalizedToken(need.job);
  const exactRegistryId = `section.${normalizedJob}`;
  const family = LANDING_PAGE_FAMILIES.find(
    candidate =>
      candidate.id === normalizedJob ||
      candidate.registryIds.includes(exactRegistryId)
  );
  if (!family) {
    return {
      need,
      evidence: [
        `LANDING_PAGE_FAMILIES has no certified family for job ${need.job}`,
      ],
    };
  }

  const normalizedMediaNeed = normalizedToken(need.mediaNeed);
  const mediaSupported = family.mediaStrategies.some(
    strategy => normalizedToken(strategy) === normalizedMediaNeed
  );
  const sectionIds = candidateSectionIds(need.job, family.registryIds);
  const candidateEvidence: string[] = [];
  const hasCertifiedFit = sectionIds.some(sectionId => {
    const section = getMarketingSection(sectionId);
    const registry = getMarketingSectionRegistryEntry(sectionId);
    if (
      section.status !== 'approved' ||
      !registry?.sourceBacked ||
      !section.variants.some(variant => variant.status === 'active')
    ) {
      candidateEvidence.push(
        `section.${sectionId} has no source-backed active variant`
      );
      return false;
    }
    const budgetEvidence = contentBudgetEvidence(sectionId, need.contentShape);
    candidateEvidence.push(...budgetEvidence);
    return mediaSupported && budgetEvidence.length === 0;
  });
  if (hasCertifiedFit) return null;

  const mediaEvidence = mediaSupported
    ? []
    : [`${family.id} does not certify media strategy ${need.mediaNeed}`];
  return {
    need,
    evidence: [
      ...mediaEvidence,
      ...candidateEvidence,
      ...getProposedSectionEvidence(sectionIds),
    ],
  };
}

export function createSectionRequest(
  need: SectionJobNeed,
  gapEvidence: readonly string[]
): SectionRequest {
  const contentKey = Object.entries(need.contentShape)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([slot, count]) => `${normalizedSlot(slot)}=${count}`)
    .join(',');
  return {
    job: need.job,
    contentShape: contentKey,
    mediaNeed: need.mediaNeed,
    evidence: [
      ...need.evidence,
      ...gapEvidence,
      `governance:${SECTION_REQUEST_GOVERNANCE.workflow}`,
    ],
    dedupeKey: [
      'factory:section-request',
      normalizedToken(need.job),
      normalizedToken(need.mediaNeed),
      contentKey,
    ].join(':'),
  };
}

export function dedupeSectionRequests(
  requests: readonly SectionRequest[]
): SectionRequest[] {
  const deduped = new Map<string, SectionRequest>();
  for (const input of requests) {
    const request = SectionRequestSchema.parse(input);
    const current = deduped.get(request.dedupeKey);
    deduped.set(
      request.dedupeKey,
      current
        ? {
            ...current,
            evidence: [...new Set([...current.evidence, ...request.evidence])],
          }
        : request
    );
  }
  return [...deduped.values()];
}

export function resolveSectionRequests(
  needs: readonly SectionJobNeed[]
): SectionRequest[] {
  const requests = needs.flatMap(input => {
    const need = SectionJobNeedSchema.parse(input);
    const gap = findGap(need);
    return gap ? [createSectionRequest(gap.need, gap.evidence)] : [];
  });
  return dedupeSectionRequests(requests);
}
