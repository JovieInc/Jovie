/**
 * JOV-5159 Phase 1 — Capture → Return homepage founder-review contracts.
 *
 * Live `/` stays frozen. Isolated proposals, generation-run, asset-shootout,
 * and founder-decision records live here until a founder approves a section
 * and `/start` golden-path proof exists. Promotion is fail-closed.
 *
 * Isolated desktop/mobile frames are versioned contract artifacts. They are
 * not live Pen mutations and not production bindings. Pen cold readback on
 * this inspector cannot produce a complete SAFE manifest without evaluating
 * or opening the document, so the baseline stays fail-closed.
 */

import { auditHomepageRootComposition } from '@/lib/homepage-role-invariants';
import { MARKETING_GENERATION_STAGES } from './generation';

export const HOMEPAGE_REDESIGN_CONTRACT_VERSION = 'homepage-redesign/v1';

export const HOMEPAGE_REDESIGN_PHASE = 'founder-review' as const;

export const HOMEPAGE_REDESIGN_ISSUE_ID = 'JOV-5159';

export const LIVE_HOMEPAGE_ROUTE = '/' as const;
export const STAGED_HOMEPAGE_ROUTE = '/new' as const;
export const START_GOLDEN_PATH_ROUTE = '/start' as const;

export const HOMEPAGE_REDESIGN_VIEWPORTS = {
  desktop: { id: 'desktop', width: 1440, height: 900 },
  mobile: { id: 'mobile', width: 390, height: 844 },
} as const;

export type HomepageRedesignViewportId =
  keyof typeof HOMEPAGE_REDESIGN_VIEWPORTS;

export const LIVE_HOMEPAGE_SOURCE_FILES = [
  'apps/web/app/(home)/page.tsx',
  'apps/web/components/features/home/HomeTrustSection.tsx',
  'apps/web/components/homepage/HomepageArtistProfiles.tsx',
  'apps/web/components/homepage/HomepageClosedLoop.tsx',
  'apps/web/components/homepage/HomepageHeroCommandCenter.tsx',
  'apps/web/components/homepage/HomepageMeetJovie.tsx',
  'apps/web/components/homepage/HomepageTrackedLink.tsx',
  'apps/web/components/homepage/intent.ts',
  'apps/web/data/homepageLaunchCopy.ts',
  'apps/web/components/marketing/homepage-v2/HomepageV2Ctas.tsx',
] as const;

export const STAGED_HOMEPAGE_SOURCE_FILES = [
  'apps/web/app/(marketing)/new/page.tsx',
  'apps/web/components/marketing/homepage-v2/HomepageV2Route.tsx',
  'apps/web/data/homepageV2Copy.ts',
] as const;

export const HOMEPAGE_PROPOSAL_NARRATIVE_SOURCE =
  'apps/web/components/features/home/CaptureFlowSection.tsx' as const;

export const LIVE_HOMEPAGE_SECTION_IDS = [
  'hero',
  'trust',
  'meet-jovie',
  'artist-profiles',
  'closed-loop',
  'faq',
  'final-cta',
] as const;

export type LiveHomepageSectionId = (typeof LIVE_HOMEPAGE_SECTION_IDS)[number];

export const LIVE_HOMEPAGE_SECTION_MARKERS: Readonly<
  Record<LiveHomepageSectionId, string>
> = {
  hero: 'function HomepageHero()',
  trust: 'homepage-trust-section',
  'meet-jovie': '<HomepageMeetJovie />',
  'artist-profiles': '<HomepageArtistProfiles',
  'closed-loop': '<HomepageClosedLoop />',
  faq: 'function HomepageFaq()',
  'final-cta': '<HomepageV2FinalCta />',
};

export interface HomepageLiveBaseline {
  readonly schema: typeof HOMEPAGE_REDESIGN_CONTRACT_VERSION;
  readonly route: typeof LIVE_HOMEPAGE_ROUTE;
  readonly sourceFiles: readonly string[];
  readonly sectionIds: readonly LiveHomepageSectionId[];
  readonly productionBinding: typeof LIVE_HOMEPAGE_ROUTE;
  readonly mutationAllowed: false;
}

export const HOMEPAGE_LIVE_BASELINE: HomepageLiveBaseline = {
  schema: HOMEPAGE_REDESIGN_CONTRACT_VERSION,
  route: LIVE_HOMEPAGE_ROUTE,
  sourceFiles: LIVE_HOMEPAGE_SOURCE_FILES,
  sectionIds: LIVE_HOMEPAGE_SECTION_IDS,
  productionBinding: LIVE_HOMEPAGE_ROUTE,
  mutationAllowed: false,
};

export interface HomepagePenBaseline {
  readonly schema: 'pen-cold-readback/v2';
  readonly workspaceProfile: 'jovie-founder-design-studio';
  readonly verdict: 'cold_readback_failed';
  readonly typedReasons: readonly ['safe_cold_manifest_unavailable'];
  readonly semanticManifest: null;
  readonly semanticManifestComplete: false;
  readonly inspectionMethod: null;
  readonly executeInvoked: false;
  readonly saveInvoked: false;
  readonly documentOpened: false;
  readonly outputDocumentCreated: false;
  readonly liveCanvasMutated: false;
}

/**
 * Pinned Pen desktop 1.2.4 / `@pen.dev/cli` 0.3.2 has no native
 * non-evaluating complete semantic inspector. Phase 1 records the official
 * fail-closed `pen-cold-readback/v2` receipt instead of inventing SAFE or
 * mutating the live canvas. Isolated proposals are versioned contract
 * artifacts only.
 */
export const HOMEPAGE_PEN_BASELINE: HomepagePenBaseline = {
  schema: 'pen-cold-readback/v2',
  workspaceProfile: 'jovie-founder-design-studio',
  verdict: 'cold_readback_failed',
  typedReasons: ['safe_cold_manifest_unavailable'],
  semanticManifest: null,
  semanticManifestComplete: false,
  inspectionMethod: null,
  executeInvoked: false,
  saveInvoked: false,
  documentOpened: false,
  outputDocumentCreated: false,
  liveCanvasMutated: false,
};

export const HOMEPAGE_PROPOSAL_IDS = ['capture-return-v1'] as const;

export type HomepageProposalId = (typeof HOMEPAGE_PROPOSAL_IDS)[number];

export const HOMEPAGE_PROPOSAL_SECTION_IDS = [
  'hero',
  'capture-return',
  'proof',
  'cta',
] as const;

export type HomepageProposalSectionId =
  (typeof HOMEPAGE_PROPOSAL_SECTION_IDS)[number];

export interface HomepageIsolatedProposalFrame {
  readonly viewportId: HomepageRedesignViewportId;
  readonly width: number;
  readonly height: number;
  readonly boundRoute: null;
  readonly grayscaleOnly: true;
  readonly hierarchy: readonly string[];
}

export interface HomepageIsolatedProposal {
  readonly id: HomepageProposalId;
  readonly title: string;
  readonly thesis: string;
  readonly sourceNarrative: 'Capture → Return';
  readonly status: 'isolated';
  readonly boundRoute: null;
  readonly liveCanvasMutated: false;
  readonly sections: readonly HomepageProposalSectionId[];
  readonly frames: readonly HomepageIsolatedProposalFrame[];
  readonly firstVisit: {
    readonly label: 'First visit';
    readonly action: string;
  };
  readonly returnVisit: {
    readonly label: 'Return visit';
    readonly action: string;
  };
}

export const HOMEPAGE_ISOLATED_PROPOSALS: readonly HomepageIsolatedProposal[] =
  [
    {
      id: 'capture-return-v1',
      title: 'Capture every first visit. Return visits go to the music.',
      thesis:
        'The homepage should sell the Capture → Return loop: first visit captures email or SMS before links, return visit skips the form and opens the music.',
      sourceNarrative: 'Capture → Return',
      status: 'isolated',
      boundRoute: null,
      liveCanvasMutated: false,
      sections: HOMEPAGE_PROPOSAL_SECTION_IDS,
      frames: [
        {
          viewportId: 'desktop',
          width: HOMEPAGE_REDESIGN_VIEWPORTS.desktop.width,
          height: HOMEPAGE_REDESIGN_VIEWPORTS.desktop.height,
          boundRoute: null,
          grayscaleOnly: true,
          hierarchy: [
            'hero promise',
            'capture-return split',
            'proof',
            'primary CTA',
          ],
        },
        {
          viewportId: 'mobile',
          width: HOMEPAGE_REDESIGN_VIEWPORTS.mobile.width,
          height: HOMEPAGE_REDESIGN_VIEWPORTS.mobile.height,
          boundRoute: null,
          grayscaleOnly: true,
          hierarchy: [
            'hero promise',
            'first-visit capture',
            'return-visit listen',
            'proof',
            'primary CTA',
          ],
        },
      ],
      firstVisit: {
        label: 'First visit',
        action: 'Get Their Email Or SMS',
      },
      returnVisit: {
        label: 'Return visit',
        action: 'Send Them Straight To Your Music',
      },
    },
  ];

export const HOMEPAGE_BEST_PROPOSAL_ID: HomepageProposalId =
  'capture-return-v1';

export interface HomepageGenerationRun {
  readonly schema: 'homepage-generation-run/v1';
  readonly issueId: typeof HOMEPAGE_REDESIGN_ISSUE_ID;
  readonly phase: typeof HOMEPAGE_REDESIGN_PHASE;
  readonly pipelineVersion: typeof HOMEPAGE_REDESIGN_CONTRACT_VERSION;
  readonly stages: typeof MARKETING_GENERATION_STAGES;
  readonly liveBaselineRoute: typeof LIVE_HOMEPAGE_ROUTE;
  readonly stagedReferenceRoute: typeof STAGED_HOMEPAGE_ROUTE;
  readonly proposalIds: readonly HomepageProposalId[];
  readonly productionMutation: 'forbidden';
}

export const HOMEPAGE_GENERATION_RUN: HomepageGenerationRun = {
  schema: 'homepage-generation-run/v1',
  issueId: HOMEPAGE_REDESIGN_ISSUE_ID,
  phase: HOMEPAGE_REDESIGN_PHASE,
  pipelineVersion: HOMEPAGE_REDESIGN_CONTRACT_VERSION,
  stages: MARKETING_GENERATION_STAGES,
  liveBaselineRoute: LIVE_HOMEPAGE_ROUTE,
  stagedReferenceRoute: STAGED_HOMEPAGE_ROUTE,
  proposalIds: HOMEPAGE_PROPOSAL_IDS,
  productionMutation: 'forbidden',
};

export interface HomepageAssetShootoutEntry {
  readonly proposalId: HomepageProposalId;
  readonly viewportId: HomepageRedesignViewportId;
  readonly liveSource: typeof LIVE_HOMEPAGE_ROUTE;
  readonly proposalBoundRoute: null;
  readonly winner: 'pending-founder';
}

export interface HomepageAssetShootout {
  readonly schema: 'homepage-asset-shootout/v1';
  readonly generationRunSchema: HomepageGenerationRun['schema'];
  readonly entries: readonly HomepageAssetShootoutEntry[];
}

export const HOMEPAGE_ASSET_SHOOTOUT: HomepageAssetShootout = {
  schema: 'homepage-asset-shootout/v1',
  generationRunSchema: HOMEPAGE_GENERATION_RUN.schema,
  entries: HOMEPAGE_PROPOSAL_IDS.flatMap(proposalId =>
    (
      Object.keys(HOMEPAGE_REDESIGN_VIEWPORTS) as HomepageRedesignViewportId[]
    ).map(viewportId => ({
      proposalId,
      viewportId,
      liveSource: LIVE_HOMEPAGE_ROUTE,
      proposalBoundRoute: null,
      winner: 'pending-founder' as const,
    }))
  ),
};

export type HomepageFounderDecisionStatus = 'pending' | 'approved' | 'rejected';

export interface HomepageFounderDecision {
  readonly schema: 'homepage-founder-decision/v1';
  readonly issueId: typeof HOMEPAGE_REDESIGN_ISSUE_ID;
  readonly status: HomepageFounderDecisionStatus;
  readonly selectedProposalId: HomepageProposalId;
  readonly productionBinding: null;
  readonly sectionApprovals: readonly never[];
  readonly startGoldenPathProof: null | string;
}

export const HOMEPAGE_FOUNDER_DECISION: HomepageFounderDecision = {
  schema: 'homepage-founder-decision/v1',
  issueId: HOMEPAGE_REDESIGN_ISSUE_ID,
  status: 'pending',
  selectedProposalId: HOMEPAGE_BEST_PROPOSAL_ID,
  productionBinding: null,
  sectionApprovals: [],
  startGoldenPathProof: null,
};

export interface HomepageSectionPromotionRequest {
  readonly sectionId: string;
  readonly proposalId: HomepageProposalId;
  readonly founderDecision: HomepageFounderDecision;
  readonly sectionApproved: boolean;
  readonly startGoldenPathProof: string | null;
  readonly alreadyPromotedSections: readonly string[];
  readonly targetRoute: typeof LIVE_HOMEPAGE_ROUTE;
}

export interface HomepageRedesignFinding {
  readonly code: string;
  readonly message: string;
}

const LIVE_HOMEPAGE_FORBIDDEN_TOKENS = [
  'capture-return-v1',
  'homepageRedesign',
  'HOMEPAGE_ISOLATED_PROPOSALS',
  'CaptureFlowSection',
] as const;

export function getHomepageIsolatedProposal(
  id: HomepageProposalId
): HomepageIsolatedProposal {
  const proposal = HOMEPAGE_ISOLATED_PROPOSALS.find(item => item.id === id);
  if (!proposal) {
    throw new Error(`Unknown homepage proposal: ${id}`);
  }
  return proposal;
}

export function auditLiveHomepageSource(
  pageSource: string
): readonly HomepageRedesignFinding[] {
  const findings: HomepageRedesignFinding[] = [];

  for (const sectionId of LIVE_HOMEPAGE_SECTION_IDS) {
    const marker = LIVE_HOMEPAGE_SECTION_MARKERS[sectionId];
    if (!pageSource.includes(marker)) {
      findings.push({
        code: 'live-homepage-section-missing',
        message: `Live \`/\` is missing ${sectionId} marker \`${marker}\`.`,
      });
    }
  }

  for (const forbidden of LIVE_HOMEPAGE_FORBIDDEN_TOKENS) {
    if (pageSource.includes(forbidden)) {
      findings.push({
        code: 'live-homepage-proposal-bound',
        message: `Live \`/\` must not reference isolated proposal token \`${forbidden}\`.`,
      });
    }
  }

  for (const finding of auditHomepageRootComposition(pageSource)) {
    findings.push({
      code: finding.code,
      message: finding.message,
    });
  }

  return findings;
}

export function auditHomepageRedesignPhase1(): readonly HomepageRedesignFinding[] {
  const findings: HomepageRedesignFinding[] = [];

  if (HOMEPAGE_LIVE_BASELINE.mutationAllowed !== false) {
    findings.push({
      code: 'live-homepage-mutation-allowed',
      message: 'Phase 1 must keep live `/` frozen.',
    });
  }

  if (HOMEPAGE_PEN_BASELINE.verdict !== 'cold_readback_failed') {
    findings.push({
      code: 'pen-baseline-overclaim',
      message:
        'Pen baseline cannot claim a complete cold manifest on the current inspector.',
    });
  }

  if (HOMEPAGE_PEN_BASELINE.liveCanvasMutated) {
    findings.push({
      code: 'pen-live-canvas-mutated',
      message: 'Phase 1 proposals must stay off the live Pen canvas.',
    });
  }

  if (HOMEPAGE_ISOLATED_PROPOSALS.length !== 1) {
    findings.push({
      code: 'best-proposal-not-singular',
      message: 'Phase 1 presents exactly one isolated proposal.',
    });
  }

  const proposal = getHomepageIsolatedProposal(
    HOMEPAGE_FOUNDER_DECISION.selectedProposalId
  );
  if (proposal.boundRoute !== null || proposal.status !== 'isolated') {
    findings.push({
      code: 'proposal-bound-to-production',
      message:
        'The selected proposal must remain isolated from production routes.',
    });
  }

  const viewportIds = proposal.frames.map(frame => frame.viewportId).toSorted();
  if (viewportIds.join(',') !== 'desktop,mobile') {
    findings.push({
      code: 'missing-isolated-viewport',
      message: 'The selected proposal must include desktop and mobile frames.',
    });
  }

  if (
    proposal.frames.some(
      frame => frame.boundRoute !== null || frame.grayscaleOnly !== true
    )
  ) {
    findings.push({
      code: 'proposal-frame-not-isolated',
      message:
        'Isolated proposal frames must stay grayscale and unbound to a route.',
    });
  }

  if (HOMEPAGE_GENERATION_RUN.productionMutation !== 'forbidden') {
    findings.push({
      code: 'generation-run-allows-production-mutation',
      message: 'The generation run must forbid production mutation in Phase 1.',
    });
  }

  if (HOMEPAGE_FOUNDER_DECISION.status !== 'pending') {
    findings.push({
      code: 'founder-decision-not-pending',
      message:
        'Phase 1 presents one proposal; it does not record founder approval.',
    });
  }

  if (HOMEPAGE_FOUNDER_DECISION.productionBinding !== null) {
    findings.push({
      code: 'founder-decision-bound-to-production',
      message: 'A pending founder decision cannot bind a production route.',
    });
  }

  if (
    HOMEPAGE_ASSET_SHOOTOUT.entries.some(
      entry => entry.winner !== 'pending-founder'
    )
  ) {
    findings.push({
      code: 'asset-shootout-declared-winner',
      message: 'Asset shootout winners require a recorded founder decision.',
    });
  }

  return findings;
}

export function auditHomepageSectionPromotion(
  request: HomepageSectionPromotionRequest
): readonly HomepageRedesignFinding[] {
  const findings: HomepageRedesignFinding[] = [];

  if (request.targetRoute !== LIVE_HOMEPAGE_ROUTE) {
    findings.push({
      code: 'promotion-wrong-route',
      message: 'Source homepage promotion is only valid for live `/`.',
    });
  }

  if (request.founderDecision.status !== 'approved') {
    findings.push({
      code: 'founder-decision-required',
      message: 'A section cannot promote without an approved founder decision.',
    });
  }

  if (request.founderDecision.selectedProposalId !== request.proposalId) {
    findings.push({
      code: 'proposal-not-selected',
      message: 'Only the founder-selected proposal may promote a section.',
    });
  }

  if (!request.sectionApproved) {
    findings.push({
      code: 'section-approval-required',
      message:
        'Each source homepage section promotes only after explicit approval.',
    });
  }

  if (!request.startGoldenPathProof) {
    findings.push({
      code: 'start-golden-path-required',
      message: 'Section promotion requires `/start` golden-path proof.',
    });
  }

  if (request.alreadyPromotedSections.length > 0) {
    findings.push({
      code: 'one-section-at-a-time',
      message:
        'Source homepage sections promote one at a time. Wait until the current section is done.',
    });
  }

  return findings;
}
