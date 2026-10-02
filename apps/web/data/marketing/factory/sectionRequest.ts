/**
 * Marketing page factory stage 5c: section-request gap detection (JOV-7254).
 *
 * A section job that no certified family, section, or active variant can
 * serve becomes a SectionRequest. Requests are deduplicated by job, media need
 * and content slots, so N pages with the same gap file one request. A
 * certified section that is merely missing from LANDING_PAGE_FAMILIES is a
 * registry gap, not a design request, and never enters the section queue.
 *
 * Pure and deterministic. Nothing here files Linear issues; the renderer only
 * produces the body for the factory:section-request queue.
 */

import { z } from 'zod';
import { getMarketingSectionRegistryEntry } from '../componentRegistry';
import {
  findProposedSectionForJob,
  getProposedSectionEvidence,
  SECTION_REQUEST_CANONICAL_PATH,
  SECTION_REQUEST_GOVERNANCE,
} from '../designGaps';
import { LANDING_PAGE_FAMILIES } from '../landingPageGrammar';
import {
  type DegradationLadder,
  getMarketingSection,
  MARKETING_DEGRADATION_LADDERS,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
} from '../sections';

export const SECTION_REQUEST_LINEAR_LABEL = 'factory:section-request';

/** Jobs a page cannot ship without; a gap on one keeps the page in shadow. */
export const ESSENTIAL_SECTION_JOBS: readonly MarketingSectionId[] = [
  'hero',
  'cta',
];

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
  /** Defaults to true for ESSENTIAL_SECTION_JOBS. */
  essential: z.boolean().optional(),
});
export type SectionJobNeed = z.input<typeof SectionJobNeedSchema>;

export const SectionRequestSchema = z.object({
  job: z.string().trim().min(1),
  contentShape: z.string().trim().min(1),
  mediaNeed: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
  dedupeKey: z.string().min(1),
  /** Existing section the job maps to, when the gap is a budget or media fit. */
  sectionId: z.string().min(1).optional(),
  essential: z.boolean().optional(),
  /** Set when PROPOSED_SECTIONS already tracks this gap; no new issue needed. */
  proposalId: z.string().min(1).optional(),
});
export type SectionRequest = z.infer<typeof SectionRequestSchema>;

export interface SectionRegistryGap {
  readonly job: string;
  readonly sectionId: MarketingSectionId;
  readonly evidence: readonly string[];
}

export interface SectionGapReport {
  readonly requests: readonly SectionRequest[];
  readonly registryGaps: readonly SectionRegistryGap[];
}

type GapFinding =
  | {
      readonly kind: 'section-request';
      readonly sectionId?: MarketingSectionId;
      readonly evidence: readonly string[];
    }
  | {
      readonly kind: 'registry-gap';
      readonly sectionId: MarketingSectionId;
      readonly evidence: readonly string[];
    };

const normalizedToken = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

function isMarketingSectionId(value: string): value is MarketingSectionId {
  return MARKETING_SECTION_IDS.includes(value as MarketingSectionId);
}

function certificationEvidence(sectionId: MarketingSectionId): string | null {
  const section = getMarketingSection(sectionId);
  const registry = getMarketingSectionRegistryEntry(sectionId);
  if (
    section.status !== 'approved' ||
    !registry?.sourceBacked ||
    !section.variants.some(variant => variant.status === 'active')
  ) {
    return `section.${sectionId} has no source-backed active variant`;
  }
  return null;
}

function contentBudgetEvidence(
  sectionId: MarketingSectionId,
  contentShape: SectionContentShape
): readonly string[] {
  const section = getMarketingSection(sectionId);
  return Object.entries(contentShape).flatMap(([slot, count]) => {
    const budget = section.contentBudgets.find(
      candidate => normalizedToken(candidate.slot) === normalizedToken(slot)
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

function candidateSectionIds(
  normalizedJob: string,
  registryIds: readonly string[]
): readonly MarketingSectionId[] {
  if (
    isMarketingSectionId(normalizedJob) &&
    registryIds.includes(`section.${normalizedJob}`)
  ) {
    return [normalizedJob];
  }
  return registryIds.flatMap(registryId => {
    if (!registryId.startsWith('section.')) return [];
    const sectionId = registryId.slice('section.'.length);
    return isMarketingSectionId(sectionId) ? [sectionId] : [];
  });
}

/** A certified section missing from LANDING_PAGE_FAMILIES is a registry gap. */
function findRegistryGap(
  normalizedJob: string,
  need: z.output<typeof SectionJobNeedSchema>
): GapFinding | null {
  if (!isMarketingSectionId(normalizedJob)) return null;
  const section = getMarketingSection(normalizedJob);
  // Unproven variants already ship through the resolver (e.g. seo
  // content-prose/article-body); certifying them is registry work too.
  const designed =
    section.status === 'approved' &&
    section.variants.some(
      variant => variant.status === 'active' || variant.status === 'unproven'
    );
  const unproven = !section.variants.some(
    variant => variant.status === 'active'
  );
  const budget = contentBudgetEvidence(normalizedJob, need.contentShape);
  if (!designed || budget.length > 0) {
    return {
      kind: 'section-request',
      sectionId: normalizedJob,
      evidence: [
        `LANDING_PAGE_FAMILIES has no certified family for job ${need.job}`,
        ...(designed
          ? []
          : [`section.${normalizedJob} has no approved variant`]),
        ...budget,
        ...getProposedSectionEvidence([normalizedJob]),
      ],
    };
  }
  // The section design exists; only the registry wiring is missing. That is
  // registry work, so it must not flood the section-request queue.
  const registry = getMarketingSectionRegistryEntry(normalizedJob);
  return {
    kind: 'registry-gap',
    sectionId: normalizedJob,
    evidence: [
      `section.${normalizedJob} has an approved design but no LANDING_PAGE_FAMILIES family lists it`,
      ...(unproven
        ? [`section.${normalizedJob} variants are unproven, not active`]
        : []),
      ...(registry?.sourceBacked
        ? []
        : [
            `section.${normalizedJob} registry entry is not source-backed: ${registry?.unresolvedReason ?? 'missing entry'}`,
          ]),
    ],
  };
}

function findGap(
  need: z.output<typeof SectionJobNeedSchema>
): GapFinding | null {
  const normalizedJob = normalizedToken(need.job);
  const family = LANDING_PAGE_FAMILIES.find(
    candidate =>
      candidate.id === normalizedJob ||
      candidate.registryIds.includes(`section.${normalizedJob}`)
  );
  if (!family) {
    return (
      findRegistryGap(normalizedJob, need) ?? {
        kind: 'section-request',
        evidence: [
          `LANDING_PAGE_FAMILIES has no certified family for job ${need.job}`,
        ],
      }
    );
  }

  const normalizedMediaNeed = normalizedToken(need.mediaNeed);
  const mediaSupported = family.mediaStrategies.some(
    strategy => normalizedToken(strategy) === normalizedMediaNeed
  );
  const sectionIds = candidateSectionIds(normalizedJob, family.registryIds);
  const candidateEvidence: string[] = [];
  const hasCertifiedFit = sectionIds.some(sectionId => {
    const blocked = certificationEvidence(sectionId);
    if (blocked) {
      candidateEvidence.push(blocked);
      return false;
    }
    const budgetEvidence = contentBudgetEvidence(sectionId, need.contentShape);
    candidateEvidence.push(...budgetEvidence);
    return mediaSupported && budgetEvidence.length === 0;
  });
  if (hasCertifiedFit) return null;

  return {
    kind: 'section-request',
    sectionId: isMarketingSectionId(normalizedJob) ? normalizedJob : undefined,
    evidence: [
      ...(mediaSupported
        ? []
        : [`${family.id} does not certify media strategy ${need.mediaNeed}`]),
      ...candidateEvidence,
      ...getProposedSectionEvidence(sectionIds),
    ],
  };
}

function isEssential(
  need: z.output<typeof SectionJobNeedSchema>,
  normalizedJob: string
): boolean {
  return (
    need.essential ??
    (isMarketingSectionId(normalizedJob) &&
      ESSENTIAL_SECTION_JOBS.includes(normalizedJob))
  );
}

export function createSectionRequest(
  input: SectionJobNeed,
  gapEvidence: readonly string[],
  sectionId?: MarketingSectionId
): SectionRequest {
  const need = SectionJobNeedSchema.parse(input);
  const normalizedJob = normalizedToken(need.job);
  // Shape is the slot set, not the exact counts: two pages with 44 and 46
  // character headlines need the same new section, so they share one request.
  const slots = Object.keys(need.contentShape)
    .map(normalizedToken)
    .toSorted((left, right) => left.localeCompare(right));
  const contentShape = slots.length > 0 ? slots.join(',') : 'empty';
  const counts = Object.entries(need.contentShape)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([slot, count]) => `content:${normalizedToken(slot)}=${count}`);
  const proposal = findProposedSectionForJob(need.job);
  return SectionRequestSchema.parse({
    job: need.job,
    contentShape,
    mediaNeed: need.mediaNeed,
    evidence: [
      ...need.evidence,
      ...counts,
      ...gapEvidence,
      `governance:${SECTION_REQUEST_GOVERNANCE.workflow}`,
    ],
    dedupeKey: [
      SECTION_REQUEST_LINEAR_LABEL,
      normalizedJob,
      normalizedToken(need.mediaNeed),
      contentShape,
    ].join(':'),
    ...(sectionId ? { sectionId } : {}),
    essential: isEssential(need, normalizedJob),
    ...(proposal ? { proposalId: proposal.id } : {}),
  });
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
            essential: Boolean(current.essential || request.essential),
          }
        : request
    );
  }
  return [...deduped.values()];
}

/** Stage 5c: split a page's section jobs into design requests and registry gaps. */
export function detectSectionGaps(
  needs: readonly SectionJobNeed[]
): SectionGapReport {
  const requests: SectionRequest[] = [];
  const registryGaps: SectionRegistryGap[] = [];
  for (const input of needs) {
    const need = SectionJobNeedSchema.parse(input);
    const gap = findGap(need);
    if (!gap) continue;
    if (gap.kind === 'registry-gap') {
      registryGaps.push({
        job: need.job,
        sectionId: gap.sectionId,
        evidence: [...need.evidence, ...gap.evidence],
      });
    } else {
      requests.push(createSectionRequest(need, gap.evidence, gap.sectionId));
    }
  }
  return { requests: dedupeSectionRequests(requests), registryGaps };
}

export function resolveSectionRequests(
  needs: readonly SectionJobNeed[]
): SectionRequest[] {
  return [...detectSectionGaps(needs).requests];
}

/** Requests that still need a factory:section-request issue. */
export function filterNewSectionRequests(
  requests: readonly SectionRequest[]
): SectionRequest[] {
  return requests.filter(request => !request.proposalId);
}

const SECTION_ASSET_CLASS: Partial<
  Record<MarketingSectionId, DegradationLadder['assetClass']>
> = {
  hero: 'product-screenshot',
  'feature-split': 'product-screenshot',
  'spec-wall': 'product-screenshot',
  'social-proof': 'artist-face',
  stats: 'proof-data',
  monetization: 'proof-data',
  'logo-cloud': 'logo',
};

/** The OMIT rung of the section's degradation ladder, when it has one. */
export function getSectionOmitRung(sectionId: MarketingSectionId): {
  readonly assetClass: DegradationLadder['assetClass'];
  readonly tier: number;
  readonly description: string;
} | null {
  const assetClass = SECTION_ASSET_CLASS[sectionId];
  const ladder = MARKETING_DEGRADATION_LADDERS.find(
    candidate => candidate.assetClass === assetClass
  );
  const omit = ladder?.rungs.at(-1);
  if (!assetClass || !omit) return null;
  return { assetClass, tier: omit.tier, description: omit.description };
}

/** Markdown body for a factory:section-request Linear issue. Never files it. */
export function renderSectionRequestIssue(request: SectionRequest): {
  readonly title: string;
  readonly labels: readonly string[];
  readonly body: string;
} {
  const parsed = SectionRequestSchema.parse(request);
  const path = SECTION_REQUEST_CANONICAL_PATH.map(
    (step, index) => `${index + 1}. **${step.stage}**: ${step.requirement}`
  );
  const body = [
    `**Job:** ${parsed.job}`,
    `**Content shape:** ${parsed.contentShape}`,
    `**Media need:** ${parsed.mediaNeed}`,
    `**Maps to section:** ${parsed.sectionId ?? 'none (new section)'}`,
    `**Essential:** ${parsed.essential ? 'yes, affected pages stay in shadow' : 'no, affected pages degrade'}`,
    `**Dedupe key:** \`${parsed.dedupeKey}\``,
    ...(parsed.proposalId
      ? [`**Tracked proposal:** ${parsed.proposalId}`]
      : []),
    '',
    '## Evidence',
    ...parsed.evidence.map(item => `- ${item}`),
    '',
    '## Path to canonical',
    ...path,
    '',
    `Until promotion, pages use the section degradation ladder. Route-local component fallbacks are ${SECTION_REQUEST_GOVERNANCE.localComponentFallback}. Workflow: ${SECTION_REQUEST_GOVERNANCE.workflow}.`,
  ].join('\n');
  return {
    title: `Section request: ${parsed.job} (${parsed.contentShape})`,
    labels: [SECTION_REQUEST_LINEAR_LABEL],
    body,
  };
}
