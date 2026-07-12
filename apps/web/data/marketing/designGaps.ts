import type { MarketingAudience, MarketingSectionId } from './sections';

export type ProposedSectionId = `PROPOSED-SECTION-${number}`;
export type ProposedSectionStatus =
  | 'proposed'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'implemented';

export interface GrayscaleWireframeSpec {
  readonly viewport: 'desktop' | 'mobile';
  readonly width: number;
  readonly hierarchy: readonly string[];
  readonly layout: string;
  readonly contentDensity: 'low' | 'medium' | 'high';
  readonly mediaPlacement: string;
  readonly responsiveBehavior: string;
  readonly interactionModel: string;
  readonly tokens: readonly ('surface' | 'border' | 'muted' | 'foreground')[];
  readonly placeholderContent: 'grayscale-only';
}

export interface ProposedSectionComment {
  readonly author: string;
  readonly date: string;
  readonly body: string;
}

export interface RegistryTaskContract {
  readonly trigger: 'after-approved';
  readonly targetSectionId: MarketingSectionId;
  readonly requiredChanges: readonly string[];
  readonly exactFiles: readonly string[];
  readonly forbiddenPatterns: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly validationCommands: readonly string[];
  readonly evidenceRequired: readonly string[];
  readonly implementedAt: string | null;
  readonly evidenceRefs: readonly string[];
}

export interface ModelUsageEstimate {
  readonly role: 'audit' | 'wireframe-spec' | 'implementation' | 'review';
  readonly model: string | 'unavailable from runtime';
  readonly tokens: number | 'unavailable from runtime';
  readonly estimatedCostUsd: number | 'unavailable from runtime';
  readonly estimationBasis: string;
}

export interface ProposedSectionRecord {
  readonly id: ProposedSectionId;
  readonly proposedSectionName: string;
  readonly status: ProposedSectionStatus;
  readonly problem: string;
  readonly affectedRoutes: readonly string[];
  readonly intendedAudience: readonly MarketingAudience[];
  readonly conversionGoal: string;
  readonly requiredContentFields: readonly string[];
  readonly requiredMedia: readonly string[];
  readonly proposedResponsiveBehavior: string;
  readonly proposedCtaBehavior: string;
  readonly sectionType: MarketingSectionId;
  readonly similarExistingSections: readonly MarketingSectionId[];
  readonly existingApprovedVariantInsufficiency: string;
  readonly wireframes: {
    readonly desktop: GrayscaleWireframeSpec;
    readonly mobile: GrayscaleWireframeSpec;
  };
  readonly openDesignQuestions: readonly string[];
  readonly implementationPriority: 'low' | 'medium' | 'high';
  readonly comments: readonly ProposedSectionComment[];
  readonly registryTask: RegistryTaskContract;
  readonly modelUsage: readonly ModelUsageEstimate[];
}

const unavailableUsage: readonly ModelUsageEstimate[] = [
  {
    role: 'audit',
    model: 'unavailable from runtime',
    tokens: 'unavailable from runtime',
    estimatedCostUsd: 'unavailable from runtime',
    estimationBasis:
      'The delegated agent runtime does not expose model billing.',
  },
];

const task = (
  targetSectionId: MarketingSectionId,
  componentPath: string
): RegistryTaskContract => ({
  trigger: 'after-approved',
  targetSectionId,
  requiredChanges: [
    'Finalize the approved typed variant contract in sections.ts.',
    'Implement with existing design-system primitives and copy-in-data.',
    'Add a deterministic fixture and desktop/mobile screenshot evidence.',
    'Migrate every affected route and mark this proposal implemented.',
  ],
  exactFiles: [
    'apps/web/data/marketing/sections.ts',
    'apps/web/data/marketing/composition.ts',
    componentPath,
    'apps/web/tests/unit/marketing/recipe-manifest.test.ts',
    'docs/marketing/DESIGN_GAPS.md',
  ],
  forbiddenPatterns: [
    'No one-off route-local section implementation.',
    'No new dependency, schema, renderer, or design-system primitive.',
    'No production binding while proposal status is proposed, reviewing, or rejected.',
  ],
  acceptanceCriteria: [
    'Implementation matches both approved grayscale wireframes.',
    'Responsive and interaction contracts are covered by tests.',
    'Every production binding resolves to an approved canonical section.',
  ],
  validationCommands: [
    'pnpm --filter web exec vitest run apps/web/tests/unit/marketing/recipe-manifest.test.ts',
    'pnpm biome check apps/web/data/marketing apps/web/tests/unit/marketing/recipe-manifest.test.ts',
  ],
  evidenceRequired: [
    'Focused manifest test output',
    '1440×900 approved-wireframe comparison screenshot',
    '390×844 approved-wireframe comparison screenshot',
    'Affected-route parity report after migration',
  ],
  implementedAt: null,
  evidenceRefs: [],
});

export const PROPOSED_SECTIONS: readonly ProposedSectionRecord[] = [
  {
    id: 'PROPOSED-SECTION-0001',
    proposedSectionName: 'Artist notification mode switcher',
    status: 'proposed',
    problem:
      'Explain and switch between release, catalog, and fan-notification modes without presenting them as unrelated cards.',
    affectedRoutes: ['/artist-notifications'],
    intendedAudience: ['artist'],
    conversionGoal: 'Start an artist notification workflow',
    requiredContentFields: [
      'mode label',
      'mode summary',
      'mode details',
      'active mode',
    ],
    requiredMedia: ['one product screenshot per mode'],
    proposedResponsiveBehavior:
      'Desktop uses a left mode rail and right media panel; mobile uses a horizontal selector above stacked content.',
    proposedCtaBehavior:
      'One unchanged page-primary CTA below the active mode summary.',
    sectionType: 'feature-split',
    similarExistingSections: ['feature-split', 'feature-grid'],
    existingApprovedVariantInsufficiency:
      'Approved feature-split variants present one static capability and feature-grid variants do not define mutually exclusive mode interaction.',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: [
          'heading',
          'mode rail',
          'active summary',
          'media',
          'primary CTA',
        ],
        layout: '4/12 selector rail + 8/12 active panel',
        contentDensity: 'medium',
        mediaPlacement: 'right panel',
        responsiveBehavior: 'Rail becomes horizontal selector below 768px',
        interactionModel: 'Single-select tabs with keyboard arrow navigation',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: [
          'heading',
          'mode selector',
          'active summary',
          'media',
          'primary CTA',
        ],
        layout: 'single stack',
        contentDensity: 'medium',
        mediaPlacement: 'full-width below copy',
        responsiveBehavior:
          'Selector scrolls horizontally without changing section height',
        interactionModel: 'Single-select tabs with 44px targets',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
    },
    openDesignQuestions: [
      'Should mode state be URL-addressable?',
      'Does media cross-fade or swap without animation?',
    ],
    implementationPriority: 'medium',
    comments: [
      {
        author: 'registry-audit',
        date: '2026-07-11',
        body: 'Awaiting design review; continue using approved static feature-split sections.',
      },
    ],
    registryTask: task(
      'feature-split',
      'apps/web/components/marketing/artist-notifications/ArtistNotificationModeSwitcher.tsx'
    ),
    modelUsage: unavailableUsage,
  },
  {
    id: 'PROPOSED-SECTION-0002',
    proposedSectionName: 'Two-rung proof carousel',
    status: 'proposed',
    problem:
      'Show recognizable and peer artist proof as one navigable sequence while preserving attribution.',
    affectedRoutes: ['/artist-profiles', '/artist-profile'],
    intendedAudience: ['artist'],
    conversionGoal: 'Claim an artist profile',
    requiredContentFields: [
      'artist name',
      'proof tier',
      'attributed statement',
      'profile link',
    ],
    requiredMedia: ['consenting artist portrait or live profile capture'],
    proposedResponsiveBehavior:
      'Desktop previews adjacent proof cards; mobile shows one card with stable-height navigation.',
    proposedCtaBehavior:
      'No CTA inside cards; page-primary CTA follows the proof section.',
    sectionType: 'social-proof',
    similarExistingSections: ['social-proof'],
    existingApprovedVariantInsufficiency:
      'The approved artist-carousel exemplar does not encode the required two-rung ordering, stable-height mobile behavior, or tier attribution contract.',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: [
          'heading',
          'tier label',
          'active proof',
          'adjacent previews',
          'navigation',
        ],
        layout: 'center card with clipped side previews',
        contentDensity: 'medium',
        mediaPlacement: 'portrait left inside card',
        responsiveBehavior: 'Side previews collapse below 768px',
        interactionModel: 'Previous/next buttons and labeled pagination',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: ['heading', 'tier label', 'proof card', 'navigation'],
        layout: 'single stable-height card',
        contentDensity: 'medium',
        mediaPlacement: 'full-width card header',
        responsiveBehavior:
          'Reserve maximum copy height to prevent layout shift',
        interactionModel:
          'Buttons plus optional swipe; keyboard remains supported',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
    },
    openDesignQuestions: ['How visibly should the two proof tiers be labeled?'],
    implementationPriority: 'high',
    comments: [
      {
        author: 'registry-audit',
        date: '2026-07-11',
        body: 'Proof must remain verified; use approved artist-carousel until review.',
      },
    ],
    registryTask: task(
      'social-proof',
      'apps/web/components/marketing/artist-profile/TwoRungProofCarousel.tsx'
    ),
    modelUsage: unavailableUsage,
  },
  {
    id: 'PROPOSED-SECTION-0003',
    proposedSectionName: 'Pay-flow video split',
    status: 'proposed',
    problem:
      'Demonstrate the payment flow beside conversion copy without turning video into a second hero.',
    affectedRoutes: ['/pay'],
    intendedAudience: ['artist'],
    conversionGoal: 'Start accepting fan payments',
    requiredContentFields: [
      'outcome heading',
      'flow summary',
      'step captions',
      'poster alt text',
    ],
    requiredMedia: ['captioned product-flow video', 'static poster fallback'],
    proposedResponsiveBehavior:
      'Desktop copy/video split; mobile stacks copy then full-width video with fixed aspect ratio.',
    proposedCtaBehavior:
      'One primary CTA in copy; video controls are not conversion CTAs.',
    sectionType: 'feature-split',
    similarExistingSections: ['feature-split'],
    existingApprovedVariantInsufficiency:
      'Approved feature-split variants cover screenshots; the video-background variant is unproven and too cinematic for an instructional pay flow.',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: [
          'heading',
          'summary',
          'primary CTA',
          'video frame',
          'captions',
        ],
        layout: '5/12 copy + 7/12 media',
        contentDensity: 'low',
        mediaPlacement: 'right fixed-ratio frame',
        responsiveBehavior: 'Stacks media below copy under 768px',
        interactionModel:
          'User-initiated playback with native controls and poster fallback',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: [
          'heading',
          'summary',
          'primary CTA',
          'video frame',
          'captions',
        ],
        layout: 'single stack',
        contentDensity: 'low',
        mediaPlacement: 'full-width below CTA',
        responsiveBehavior: 'Fixed aspect ratio reserves playback height',
        interactionModel: 'User-initiated playback; no autoplay',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
    },
    openDesignQuestions: [
      'Should step captions sit below the player or use an external transcript?',
    ],
    implementationPriority: 'medium',
    comments: [
      {
        author: 'registry-audit',
        date: '2026-07-11',
        body: 'Keep the current approved screenshot split until captioned video assets exist.',
      },
    ],
    registryTask: task(
      'feature-split',
      'apps/web/features/pay/PayFlowVideoSplit.tsx'
    ),
    modelUsage: unavailableUsage,
  },
  {
    id: 'PROPOSED-SECTION-0004',
    proposedSectionName: 'Download platform selector',
    status: 'reviewing',
    problem:
      'Let visitors choose an available desktop platform while clearly distinguishing unavailable platforms.',
    affectedRoutes: ['/download'],
    intendedAudience: ['artist', 'general'],
    conversionGoal: 'Download the desktop application',
    requiredContentFields: [
      'platform',
      'availability',
      'system requirement',
      'download label',
    ],
    requiredMedia: ['platform icon from existing icon set'],
    proposedResponsiveBehavior:
      'Desktop uses equal selector cards; mobile uses a stacked radio-card list with the selected action below.',
    proposedCtaBehavior:
      'Only the selected available platform exposes the page-primary download CTA.',
    sectionType: 'feature-grid',
    similarExistingSections: ['feature-grid', 'capture'],
    existingApprovedVariantInsufficiency:
      'Approved feature-grid variants are informational card grids and do not define selection, availability, or a single conditional download action.',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: [
          'heading',
          'platform cards',
          'availability detail',
          'download CTA',
        ],
        layout: 'three equal cards over one detail/action row',
        contentDensity: 'medium',
        mediaPlacement: 'small icon at card top',
        responsiveBehavior: 'Cards become a vertical list under 640px',
        interactionModel:
          'Single-select radio cards; unavailable choices are labeled, not disabled without explanation',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: [
          'heading',
          'platform list',
          'availability detail',
          'download CTA',
        ],
        layout: 'single stack',
        contentDensity: 'medium',
        mediaPlacement: 'leading icon in each row',
        responsiveBehavior:
          'Action remains in normal flow below the stable list',
        interactionModel:
          'Radio-card list with 44px targets and announced availability',
        tokens: ['surface', 'border', 'muted', 'foreground'],
        placeholderContent: 'grayscale-only',
      },
    },
    openDesignQuestions: [
      'Should unavailable platforms accept waitlist intent?',
    ],
    implementationPriority: 'high',
    comments: [
      {
        author: 'registry-audit',
        date: '2026-07-11',
        body: 'Reviewing interaction contract; production remains mapped to approved feature-grid.',
      },
    ],
    registryTask: task(
      'feature-grid',
      'apps/web/components/marketing/download/DownloadPlatformSelector.tsx'
    ),
    modelUsage: unavailableUsage,
  },
] as const;

export function getProposedSection(
  id: ProposedSectionId
): ProposedSectionRecord | null {
  return PROPOSED_SECTIONS.find(proposal => proposal.id === id) ?? null;
}
