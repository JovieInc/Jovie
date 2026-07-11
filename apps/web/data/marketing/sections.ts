/**
 * Marketing Section Registry — typed taxonomy of every section type a Jovie
 * marketing page may compose. Owns ALL normative rules for sections per the
 * amended charter (GOAL.md D1=B, DX1): legal variants, chooseWhen predicates,
 * lifecycle, content limits, accessibility, responsive contract, degradation
 * ladders. Docs under docs/marketing/ own rationale only and link by stable id.
 *
 * Inherited invariants (NOT restated here — see AGENT_GUIDE.md §Inherited):
 *   - dark-only theme (charter delta #9; DESIGN.md System A)
 *   - fully static: revalidate = false (.claude/rules/ui.md)
 *   - copy-in-data files (apps/web/data/*Copy.ts pattern)
 *   - one body face, one container width ('page' | 'prose'), spacing-only transitions
 *
 * Stability contract: MARKETING_SPEC_VERSION (see index.ts). Section ids are
 * kebab-case (charter delta #9; regex-asserted in the manifest gate). Adding a
 * section = minor bump; removing/deprecating one = major bump + lifecycle field.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive enums / unions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical section ids. Kebab-case, stable, regex-asserted: /^[a-z][a-z0-9-]*$/.
 * Order in this union is the canonical catalog order (mirrors SECTION_CATALOG.md).
 * Nav / Footer / Subfooter are DELIBERATELY EXCLUDED per charter delta #9 —
 * those are layout-owned chrome, not page-composable sections.
 */
export type MarketingSectionId =
  // ── Industry stable core (≥6/7 prior-art systems) ──────────────────────────
  | 'hero'
  | 'logo-cloud'
  | 'feature-grid'
  | 'feature-split'
  | 'how-it-works'
  | 'social-proof'
  | 'stats'
  | 'pricing'
  | 'comparison'
  | 'faq'
  | 'cta'
  // ── Jovie deltas (no clean industry equivalent) ─────────────────────────────
  | 'spec-wall' // dense compact feature grid; "Details That Matter"
  | 'capture' // fan-capture product demo (not just an email form)
  | 'monetization' // monetization pitch + take-rate transparency
  | 'ownership' // own-your-fans/data/earnings; artist-recipe emotional differentiator
  // ── Long-form / editorial (SEO + blog-landing recipes) ──────────────────────
  | 'content-prose' // article body / long-form prose (SEO, founder-letter, release-notes)
  | 'blog-feed'; // featured post + grid (blog-landing, blog-category)

/** 17 sections. Asserted by the manifest gate (count floor). */
export const MARKETING_SECTION_IDS: readonly MarketingSectionId[] = [
  'hero',
  'logo-cloud',
  'feature-grid',
  'feature-split',
  'how-it-works',
  'social-proof',
  'stats',
  'pricing',
  'comparison',
  'faq',
  'cta',
  'spec-wall',
  'capture',
  'monetization',
  'ownership',
  'content-prose',
  'blog-feed',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Variant axes (orthogonal, typed — prior-art §4)
// ─────────────────────────────────────────────────────────────────────────────

/** Primary layout axis. The single most leveraged axis in every prior-art system. */
export type VariantLayout = 'centered' | 'split' | 'contained' | 'full-bleed';

/** Media axis. Maps to Jovie asset availability + degradation ladder. */
export type VariantMedia =
  | 'none'
  | 'screenshot'
  | 'bordered-screenshot'
  | 'phone' // phone-framed profile/storefront — artist-recipes
  | 'video'
  | 'code'
  | 'illustration';

/** Media position. Only meaningful when layout='split'. */
export type VariantMediaPosition = 'left' | 'right' | 'bottom' | 'background';

/** Column count for grid sections. Implies the responsive collapse contract. */
export type VariantColumns = 2 | 3 | 4 | 6;

/** Density within a grid cell: large (image-first) vs compact (icon-list). */
export type VariantDensity = 'large' | 'compact' | 'icon-list';

/** Text alignment. Cheap, high leverage. */
export type VariantAlignment = 'centered' | 'left';

/**
 * A variant is a typed tuple over orthogonal axes (prior-art §4 recommendation),
 * NOT an arbitrary name. The variant id is DERIVED mechanically from the tuple
 * (kebab): `{layout}[-{media}[-{mediaPosition}]][-{columns}{density?}`.
 * Examples: `hero/centered-phone`, `feature-grid/3-large`, `feature-split/screenshot-right`.
 * No surveyed system types its variants; this is the Jovie delta that prevents
 * the shadcn/Relume variant-explosion failure mode (245 heroes, 311 features).
 */
export interface MarketingVariant {
  readonly id: string; // derived kebab id; regex-asserted unique per section
  readonly layout: VariantLayout;
  readonly media: VariantMedia;
  readonly mediaPosition?: VariantMediaPosition; // required iff layout='split'
  readonly columns?: VariantColumns; // required iff section uses grid family
  readonly density?: VariantDensity; // optional refinement of columns
  readonly alignment?: VariantAlignment; // default per section
  /**
   * Deterministic auto-selection predicate. Given a Brief + section context,
   * returns whether this variant is the auto-pick. Predicates form a TOTAL
   * ORDER per section (no ties); the manifest gate asserts one defaultVariant
   * and that every reachable Brief resolves to exactly one variant.
   *
   * Implemented in composition.ts as a total-order table, not arbitrary code —
   * keeps the decision engine mechanically checkable. This field is the
   * declarative summary; composition.ts is the executable form.
   */
  readonly chooseWhen?: string; // human-readable predicate summary; canonical in composition.ts
  /**
   * Reference implementation pointer to a shipped section instance. Variants
   * without a shipped exemplar are `status: 'unproven'` and require
   * humanOptIn (manifest field) on first use per DX2 escape hatch.
   */
  readonly exemplar?: {
    readonly route: string; // e.g. '/artist-profiles'
    readonly section: string; // section id as it appears there
  };
  readonly status: VariantStatus;
  readonly deprecatedSince?: string; // spec version
  readonly replacedBy?: string; // variant id; must reference an active variant
}

export type VariantStatus = 'active' | 'deprecated' | 'removed' | 'unproven';

// ─────────────────────────────────────────────────────────────────────────────
// Section definition (normative — owns all rules for one section type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proof-class sections: social-proof, stats. logo-cloud is trust-class but
 * follows the same zero-proof legality (charter design law #9: no verified
 * data → section is ILLEGAL, never faked).
 */
export type ProofClass = 'proof' | 'trust' | 'none';

/**
 * Some sections are ILLEGAL for certain audiences. The artist emotional arc
 * (creator-economy R9: recognition → identity → aspiration → capability →
 * money-reality → relatability → low-risk action) has NO problem-agitation
 * beat, so any section that agitates a problem is illegal when audience=artist.
 * Also: enterprise/security/ROI/demo-gate sections are illegal on artist paths
 * (creator R10) — those are handled via audience-gated section legality here
 * and the recipe decision table in composition.ts.
 */
export type AudienceLegality =
  | { readonly legal: true }
  | {
      readonly legal: false;
      readonly reason: string;
      readonly audience: MarketingAudience;
    };

export type MarketingAudience =
  | 'artist'
  | 'fan'
  | 'agency'
  | 'label'
  | 'enterprise-buyer'
  | 'general';

/**
 * Per-slot content limits per breakpoint. Over-budget = manifest check failure.
 * Derived from the type scale (DESIGN.md); stated once here, not per-variant.
 */
export interface ContentBudget {
  readonly slot: string; // e.g. 'headline', 'subhead', 'card-title'
  readonly maxCharsDesktop: number;
  readonly maxCharsMobile: number;
  readonly overflowStrategy: 'truncate' | 'shrink-tier' | 'reject';
}

/**
 * A section definition. Every field is normative and machine-checkable.
 * Rationale lives in SECTION_CATALOG.md keyed by the same id.
 */
export interface MarketingSection {
  readonly id: MarketingSectionId;
  readonly label: string; // human label; reused in testids per E6/DX8
  /** Required input slots. A page composition is invalid if any is missing. */
  readonly requiredInputs: readonly string[];
  /** Optional input slots. */
  readonly optionalInputs: readonly string[];
  /** Legal variants for this section. Closed set; prevents variant explosion. */
  readonly variants: readonly MarketingVariant[];
  /** The default variant when no chooseWhen predicate matches. Always defined. */
  readonly defaultVariant: string;
  /**
   * Proof/trust class — drives the zero-proof legality gate. If 'proof' or
   * 'trust', the section is ILLEGAL unless the composition carries verified
   * proof data (manifest field `proofData: {verified: true, source}`). The
   * charter's zero-proof design law: fabricated/placeholder data is forbidden
   * at every rung; substitute = screenshot-registry product render or omit.
   */
  readonly proofClass: ProofClass;
  /**
   * Audience legality table. If a section is illegal for an audience, the
   * decision engine never selects it for that audience's recipe.
   */
  readonly audienceLegality: readonly AudienceLegality[];
  /**
   * Sections that may NEVER follow this one. Composition rule, encoded here
   * so the manifest gate can statically assert no recipe violates it.
   * Example: 'pricing' illegalAfter: ['hero'] would mean pricing can't
   * directly follow hero. The actual rules live below; this field is the
   * per-section contribution.
   */
  readonly illegalAfter?: readonly MarketingSectionId[];
  /** Sections that MUST appear before this one (provenance precondition). */
  readonly requiresPrior?: readonly MarketingSectionId[];
  /** Per-slot content budgets. Over-budget = check failure. */
  readonly contentBudgets: readonly ContentBudget[];
  /**
   * Responsive contract — fixed per variant, documented once here.
   * Example for grid: "columns:3 → 3→2→1 collapse at md/sm; split→stack media-below at md".
   * Stated as a string per the Tailwind Plus stance (prior-art §5): responsive
   * behavior is a fixed contract of the variant, NOT a per-breakpoint style override.
   */
  readonly responsiveContract: string;
  /**
   * Concrete a11y requirements per section type (keyboard, contrast, touch
   * target, reduced-motion). Stated once here; not restated in docs.
   */
  readonly accessibility: {
    readonly keyboard: string;
    readonly contrast: string;
    readonly touchTarget: string;
    readonly reducedMotion: string;
  };
  /** Reference to the shipped component path (E6/DX8 reconciliation). */
  readonly component: string; // e.g. 'components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro'
  /** Failure modes specific to this section. */
  readonly failureModes: readonly string[];
  /**
   * Hard never-use rules. Examples: problem-agitation sections for artist
   * audience; demo-gate on creator paths; fabricated metrics anywhere.
   * Stated as human-readable assertions; the decision engine encodes them
   * as hard legality failures.
   */
  readonly neverUse: readonly string[];
  readonly status: 'approved' | 'deprecated' | 'removed';
  readonly deprecatedSince?: string;
  readonly replacedBy?: MarketingSectionId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Degradation ladders (charter design law #9 + Design F2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per asset class: preferred → allowed substitute → omit. Fabricated/
 * placeholder visuals are FORBIDDEN at every rung. Screenshots bind to
 * registry scenario IDs only (lib/screenshots/registry.ts).
 *
 * The decision engine walks this ladder when a preferred asset is missing.
 */
export interface DegradationLadder {
  readonly assetClass:
    | 'proof-data'
    | 'artist-face'
    | 'product-screenshot'
    | 'video'
    | 'logo';
  readonly rungs: readonly {
    readonly tier: number; // 1 = preferred
    readonly description: string;
    readonly sourceConstraint: string; // e.g. 'verified only', 'screenshot-registry scenario id'
  }[];
}

export const MARKETING_DEGRADATION_LADDERS: readonly DegradationLadder[] = [
  {
    assetClass: 'proof-data',
    rungs: [
      {
        tier: 1,
        description:
          'Named, real, consenting case study with streaming-equivalence math',
        sourceConstraint: 'verified only; consenting subject',
      },
      {
        tier: 2,
        description: 'Aggregate platform counter with real data',
        sourceConstraint: 'verified only; no fabrication',
      },
      {
        tier: 3,
        description:
          'Take-rate / unit-economics transparency (rate, not projected earnings)',
        sourceConstraint: 'live pricing data',
      },
      {
        tier: 4,
        description:
          'Screenshot-registry product render (product-as-hero proof)',
        sourceConstraint: 'SCREENSHOT_SCENARIO_IDS membership',
      },
      {
        tier: 5,
        description: 'OMIT the proof beat entirely',
        sourceConstraint: 'n/a — zero-proof path',
      },
    ],
  },
  {
    assetClass: 'artist-face',
    rungs: [
      {
        tier: 1,
        description:
          'Two-rung: recognizable artist (aspiration) + peer/pre-scale artist (relatability)',
        sourceConstraint: 'consenting; real names',
      },
      {
        tier: 2,
        description: 'Peer/pre-scale artist only',
        sourceConstraint: 'consenting; real names',
      },
      {
        tier: 3,
        description:
          'Recognizable artist only + large aggregate count as relatability valve',
        sourceConstraint: 'consenting; real aggregate',
      },
      {
        tier: 4,
        description: 'OMIT — proof section illegal (zero-proof path)',
        sourceConstraint: 'n/a',
      },
    ],
  },
  {
    assetClass: 'product-screenshot',
    rungs: [
      {
        tier: 1,
        description:
          'Live-looking artist profile (phone-framed) from screenshot registry',
        sourceConstraint: 'SCREENSHOT_SCENARIO_IDS membership',
      },
      {
        tier: 2,
        description: 'Money-in-dashboard product render',
        sourceConstraint: 'screenshot registry or live product state',
      },
      {
        tier: 3,
        description: 'OMIT — use a non-visual variant',
        sourceConstraint: 'n/a',
      },
    ],
  },
  {
    assetClass: 'video',
    rungs: [
      {
        tier: 1,
        description: 'Cinematic product video (max 1/page, hero-only)',
        sourceConstraint: 'produced asset; reduced-motion fallback required',
      },
      {
        tier: 2,
        description: 'Animated GIF demo inside a feature card',
        sourceConstraint: 'produced asset',
      },
      {
        tier: 3,
        description: 'OMIT — static screenshot',
        sourceConstraint: 'screenshot registry',
      },
    ],
  },
  {
    assetClass: 'logo',
    rungs: [
      {
        tier: 1,
        description: 'Segmented logos (relevant to the audience)',
        sourceConstraint: 'real customer or platform logos only',
      },
      {
        tier: 2,
        description:
          'DSP/platform-reach row (Spotify, Apple Music) for artist recipes',
        sourceConstraint: 'real platform logos',
      },
      {
        tier: 3,
        description: 'OMIT — logo-cloud section illegal (zero-proof path)',
        sourceConstraint: 'n/a',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The registry
// ─────────────────────────────────────────────────────────────────────────────

export const MARKETING_SECTIONS: readonly MarketingSection[] = [
  // ── hero ───────────────────────────────────────────────────────────────────
  {
    id: 'hero',
    label: 'Hero',
    requiredInputs: ['headline', 'subhead', 'primaryCta'],
    optionalInputs: ['secondaryCta', 'media', 'logos', 'handleClaimBar'],
    variants: [
      {
        id: 'centered-handle-claim',
        layout: 'centered',
        media: 'phone',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND conversion=claim-handle AND recipe=artist-lp (Linktree-style claim bar) — checked FIRST (more specific than centered-phone)',
        exemplar: { route: '/artist-profiles', section: 'hero' },
        status: 'active',
      },
      {
        id: 'centered-phone',
        layout: 'centered',
        media: 'phone',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND recipe=artist-lp AND assetClass=product-screenshot tier≥1 (fallback when not claim-handle)',
        exemplar: { route: '/artist-profiles', section: 'hero' },
        status: 'active',
      },
      {
        id: 'split-screenshot-right',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'audience=general OR recipe=homepage AND assetClass=product-screenshot tier≥1',
        exemplar: { route: '/new', section: 'hero' },
        status: 'active',
      },
      {
        id: 'centered-none',
        layout: 'centered',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'recipe=seo OR recipe=blog-landing (interior hero) OR no asset available',
        exemplar: { route: '/about', section: 'hero' },
        status: 'active',
      },
      {
        id: 'centered-video',
        layout: 'centered',
        media: 'video',
        alignment: 'centered',
        chooseWhen:
          'recipe=launch AND cinematicMomentBudget=available (max 1/page)',
        exemplar: { route: '/launch', section: 'hero' },
        status: 'unproven',
      },
    ],
    defaultVariant: 'centered-none',
    proofClass: 'none', // hero is not proof; the logos slot is proof and gated separately
    audienceLegality: [{ legal: true }],
    illegalAfter: [], // hero is always first (composition rule)
    requiresPrior: [],
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'subhead',
        maxCharsDesktop: 140,
        maxCharsMobile: 100,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'cta-label',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
    ],
    responsiveContract:
      'centered: single-column always; split: stack media-below at md (≤768px); handleClaimBar: full-width input below subhead at sm',
    accessibility: {
      keyboard:
        'h1 is the first focusable heading; CTAs are real <a>/<button> with visible focus ring',
      contrast:
        'headline/subhead/CTA all meet AA on dark canvas (tokens.text-primary/secondary)',
      touchTarget:
        'primary CTA ≥44×44px at sm; handle-claim input ≥44px height',
      reducedMotion:
        'hero media motion gated behind prefers-reduced-motion; phone-rotation paused if present',
    },
    component: 'components/marketing/MarketingHero',
    failureModes: [
      'Multiple audiences in one hero (dilutes conversion — B2B anti-pattern #1)',
      'Feature-listing hero instead of one category/outcome claim (B2B anti-pattern #2)',
      'Proof pushed below the fold (violates above-the-fold contract)',
      'Multiple competing primary CTAs (one dominant CTA is the invariant — B2B C6)',
    ],
    neverUse: [
      'As anything other than the first section (composition rule)',
      'With fabricated metrics in the logos/media slot (zero-proof law)',
    ],
    status: 'approved',
  },

  // ── logo-cloud ──────────────────────────────────────────────────────────────
  {
    id: 'logo-cloud',
    label: 'Logo Cloud',
    requiredInputs: ['logos'],
    optionalInputs: ['caption'],
    variants: [
      {
        id: 'inline-strip',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen: 'placement=early-proof (after hero) AND logos available',
        exemplar: { route: '/artist-profiles', section: 'trust' },
        status: 'active',
      },
      {
        id: 'platform-reach-row',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND logos are DSPs/platforms the artist reaches (Spotify, Apple Music) — NOT customer logos',
        exemplar: { route: '/launch', section: 'supported-platforms' },
        status: 'active',
      },
      {
        id: 'segmented-grid',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=agency OR audience=label AND logos segmentable by industry vertical',
        status: 'unproven',
      },
    ],
    defaultVariant: 'inline-strip',
    proofClass: 'trust', // zero-proof gated
    audienceLegality: [{ legal: true }],
    illegalAfter: ['pricing', 'cta'], // trust belongs early, not as a closing beat
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'caption',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'logo-count',
        maxCharsDesktop: 12,
        maxCharsMobile: 8,
        overflowStrategy: 'reject',
      }, // count of logos; over = reject
    ],
    responsiveContract:
      'inline-strip: wrap row, center-align, no horizontal scroll; segmented-grid: 3→2→1 collapse at md/sm',
    accessibility: {
      keyboard:
        'logos are decorative <img alt=""> if meaning is in caption; else alt=name',
      contrast: 'logos on dark canvas meet AA against tokens.surface-1',
      touchTarget: 'no interactive targets (decorative); if clickable, ≥44×44',
      reducedMotion:
        'no motion (inline-strip is static by default; marquee banned per motion budget)',
    },
    component: 'components/features/home/HomeTrustSection',
    failureModes: [
      'Irrelevant or unsegmented logo wall (B2B anti-pattern #4: "a relevant logo is worth ten irrelevant ones")',
      'Fabricated or unverifiable logos (zero-proof law)',
      'Using customer-company logos on artist-recipes (creator R6: artist pages show DSPs the artist reaches, not customer logos)',
    ],
    neverUse: [
      'Without verified logo assets (zero-proof path: omit the section)',
      'As the closing beat (illegalAfter pricing/cta)',
      'On artist-recipes with customer-company logos (use platform-reach-row variant instead)',
    ],
    status: 'approved',
  },

  // ── feature-grid ────────────────────────────────────────────────────────────
  {
    id: 'feature-grid',
    label: 'Feature Grid',
    requiredInputs: ['items'],
    optionalInputs: ['eyebrow', 'title', 'lede'],
    variants: [
      {
        id: '3-large',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'large',
        alignment: 'centered',
        chooseWhen:
          'items.length=3 AND emphasis=high (breadth survey before depth)',
        exemplar: { route: '/artist-profiles', section: 'outcomes' },
        status: 'active',
      },
      {
        id: '4-equal',
        layout: 'contained',
        media: 'none',
        columns: 4,
        density: 'large',
        alignment: 'centered',
        chooseWhen: 'items.length=4 AND emphasis=medium',
        status: 'active',
      },
      {
        id: '6-compact',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'compact',
        alignment: 'centered',
        chooseWhen: 'items.length=6 AND emphasis=low (icon list)',
        status: 'active',
      },
      {
        id: 'icon-list',
        layout: 'contained',
        media: 'none',
        columns: 2,
        density: 'icon-list',
        alignment: 'left',
        chooseWhen:
          'items.length≥4 AND copy is short label-only (no body text)',
        status: 'active',
      },
    ],
    defaultVariant: '3-large',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: [],
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'eyebrow',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
      {
        slot: 'title',
        maxCharsDesktop: 56,
        maxCharsMobile: 40,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'lede',
        maxCharsDesktop: 120,
        maxCharsMobile: 90,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'card-title',
        maxCharsDesktop: 48,
        maxCharsMobile: 36,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'card-body',
        maxCharsDesktop: 140,
        maxCharsMobile: 100,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:3 → 3→2→1 at md/sm; columns:4 → 4→2→1; columns:2 → 2→1; icon-list stays 2-col until sm then 1-col',
    accessibility: {
      keyboard:
        'cards are semantic <li> in <ul>; if interactive, Tab order follows visual order',
      contrast: 'card title/body meet AA on tokens.surface-1',
      touchTarget:
        'no interactive targets unless card is a link (then ≥44×44 hit area)',
      reducedMotion: 'no motion (static grid by default)',
    },
    component:
      'components/marketing/artist-profile/ArtistProfileOutcomesCarousel',
    failureModes: [
      'Bespoke layout per card (B2B anti-pattern #8: one repeated template per section type is the invariant)',
      'Feature-listing hero (this section is for breadth, not the hero claim)',
      'Empty cells from odd item counts (use a variant whose columns divides items.length)',
    ],
    neverUse: [
      'With fabricated feature claims (copy must describe real capability)',
    ],
    status: 'approved',
  },

  // ── feature-split ───────────────────────────────────────────────────────────
  {
    id: 'feature-split',
    label: 'Feature Split',
    requiredInputs: ['headline', 'body', 'media'],
    optionalInputs: ['eyebrow', 'cta', 'bullets'],
    variants: [
      {
        id: 'screenshot-right',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'default for feature-split; product-screenshot asset available',
        exemplar: { route: '/artist-profiles', section: 'adaptive' },
        status: 'active',
      },
      {
        id: 'bordered-screenshot-left',
        layout: 'split',
        media: 'bordered-screenshot',
        mediaPosition: 'left',
        alignment: 'left',
        chooseWhen: 'emphasis on the visual; reading order puts media first',
        exemplar: { route: '/artist-profiles', section: 'reactivation' },
        status: 'active',
      },
      {
        id: 'phone-right',
        layout: 'split',
        media: 'phone',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen: 'audience=artist AND media is a phone-framed profile',
        status: 'unproven',
      },
      {
        id: 'video-background',
        layout: 'full-bleed',
        media: 'video',
        mediaPosition: 'background',
        alignment: 'centered',
        chooseWhen:
          'cinematicMomentBudget=available AND recipe=launch (max 1/page total)',
        status: 'unproven',
      },
    ],
    defaultVariant: 'screenshot-right',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: [],
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'eyebrow',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
      {
        slot: 'headline',
        maxCharsDesktop: 64,
        maxCharsMobile: 44,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'body',
        maxCharsDesktop: 220,
        maxCharsMobile: 160,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'bullet',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'split: stack media-below at md (≤768px); full-bleed: video hidden at sm, poster image fallback',
    accessibility: {
      keyboard: 'if CTA present, real <a>/<button> with focus ring',
      contrast: 'text over media meets AA; if not, add tokens.surface-1 scrim',
      touchTarget: 'CTA ≥44×44 at sm',
      reducedMotion: 'video motion gated; static poster fallback required',
    },
    component: 'components/marketing/artist-profile/ArtistProfileAdaptiveIntro',
    failureModes: [
      'Bespoke layout per section (one repeated template per section type is the invariant — B2B anti-pattern #8)',
      'Media without alt/aria (a11y failure)',
      'Two different primary CTAs across sibling feature-splits (one repeated primary label — B2B C6)',
    ],
    neverUse: [
      'As a problem-agitation section for audience=artist (creator R9: no problem beat in artist arc)',
    ],
    status: 'approved',
  },

  // ── how-it-works ────────────────────────────────────────────────────────────
  {
    id: 'how-it-works',
    label: 'How It Works',
    requiredInputs: ['steps'],
    optionalInputs: ['eyebrow', 'title', 'lede'],
    variants: [
      {
        id: '3-step-strip',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'compact',
        alignment: 'centered',
        chooseWhen:
          'steps.length=3 AND onboarding-style ("create → customize → share")',
        exemplar: { route: '/artist-profiles', section: 'howItWorks' },
        status: 'active',
      },
      {
        id: '4-step-strip',
        layout: 'contained',
        media: 'none',
        columns: 4,
        density: 'compact',
        alignment: 'centered',
        chooseWhen: 'steps.length=4',
        status: 'active',
      },
      {
        id: '3-step-media',
        layout: 'contained',
        media: 'screenshot',
        columns: 3,
        density: 'large',
        alignment: 'centered',
        chooseWhen: 'steps.length=3 AND each step has a product screenshot',
        status: 'unproven',
      },
    ],
    defaultVariant: '3-step-strip',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['pricing', 'cta', 'faq'],
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'step-title',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
      {
        slot: 'step-body',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:3 → 3→1 at sm (no 2-col intermediate for steps); columns:4 → 4→2→1',
    accessibility: {
      keyboard:
        'ordered list <ol>; step number is aria-hidden, title carries meaning',
      contrast: 'step title/body meet AA',
      touchTarget: 'no interactive targets unless step links out (then ≥44×44)',
      reducedMotion: 'no motion',
    },
    component: 'components/marketing/artist-profile/ArtistProfileHowItWorks',
    failureModes: [
      'Steps that agitate a problem (audience=artist: no problem beat — creator R9)',
      'More than 4 steps (cognitive overload; if more, split into a second how-it-works or fold into content-prose)',
    ],
    neverUse: [
      'After pricing/cta/faq (terminal-section proximity illegalAfter)',
    ],
    status: 'approved',
  },

  // ── social-proof ────────────────────────────────────────────────────────────
  {
    id: 'social-proof',
    label: 'Social Proof',
    requiredInputs: ['proofItems'],
    optionalInputs: ['eyebrow', 'title'],
    variants: [
      {
        id: 'artist-carousel',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND proofItems are artist faces/profiles (names, no quotes — creator R3)',
        exemplar: { route: '/artist-profiles', section: 'socialProof' },
        status: 'active',
      },
      {
        id: 'two-rung-aspiration',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND proofItems have both recognizable-tier + peer-tier (creator R2: two-rung aspiration)',
        status: 'unproven',
      },
      {
        id: 'case-study-fused',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'recipe=feature OR recipe=homepage AND proofItems is one customer + metric (B2B C5: case-study-as-feature)',
        status: 'unproven',
      },
      {
        id: 'named-micro-case-study',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND proofItems is one named artist with streaming-equivalence math (creator R3: "$X = Y streams")',
        status: 'unproven',
      },
      {
        id: 'quote-grid',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'compact',
        alignment: 'centered',
        chooseWhen:
          'audience=enterprise-buyer AND quotes are short (~120 chars) and from small/relatable artists (creator R5: famous=profiles, quotes=small)',
        status: 'unproven',
      },
    ],
    defaultVariant: 'artist-carousel',
    proofClass: 'proof', // zero-proof gated — the load-bearing legality
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero'], // proof belongs after value/feature, never immediately after hero (B2B C4: proof is a gradient, not a top beat)
    requiresPrior: ['hero', 'feature-grid'], // credibility preconditions
    contentBudgets: [
      {
        slot: 'quote',
        maxCharsDesktop: 140,
        maxCharsMobile: 100,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'attributor-name',
        maxCharsDesktop: 40,
        maxCharsMobile: 30,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'attributor-role',
        maxCharsDesktop: 60,
        maxCharsMobile: 40,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'carousel: horizontal scroll with snap at sm, grid at md+; quote-grid: 3→2→1; case-study-fused: stack media-below at md',
    accessibility: {
      keyboard:
        'carousel: arrow keys + tab to cards; grid: tab follows visual order',
      contrast: 'all text meets AA',
      touchTarget: 'carousel nav arrows ≥44×44; swipe enabled on touch',
      reducedMotion:
        'carousel auto-advance off by default; reduced-motion: snap only, no auto',
    },
    component: 'components/marketing/artist-profile/ArtistProfileSocialProof',
    failureModes: [
      'Fabricated quotes or attributor titles (zero-proof law)',
      'Megastars-only proof without peer-tier (creator anti-pattern: creates "not-for-me" distance — creator R2)',
      'Founder-first proof near top of artist page (DESIGN.md ui.md smell; banned — use product-render only near top)',
      'Testimonial walls with headshot+name+title+paragraph (creator anti-pattern #3: quotes are rare, ~120 chars, never from "Head of X at Y")',
    ],
    neverUse: [
      'Without verified proof data (zero-proof path: omit; substitute = screenshot-registry product render per degradation ladder)',
      'Immediately after hero (illegalAfter hero — proof is a gradient)',
      'For audience=artist with quotes from famous artists (creator R5: famous=profiles, quotes=small/relatable)',
    ],
    status: 'approved',
  },

  // ── stats ───────────────────────────────────────────────────────────────────
  {
    id: 'stats',
    label: 'Stats',
    requiredInputs: ['stats'],
    optionalInputs: ['eyebrow', 'title'],
    variants: [
      {
        id: '3-stat-band',
        layout: 'full-bleed',
        media: 'none',
        columns: 3,
        density: 'compact',
        alignment: 'centered',
        chooseWhen:
          'stats.length=3 AND placement=before-final-cta (B2B C2: scale metric as closing argument)',
        status: 'unproven',
      },
      {
        id: '4-stat-band',
        layout: 'full-bleed',
        media: 'none',
        columns: 4,
        density: 'compact',
        alignment: 'centered',
        chooseWhen: 'stats.length=4 AND placement=before-final-cta',
        status: 'unproven',
      },
      {
        id: 'freshness-counter',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'one stat that is a live/daily counter (creator R10: daily-granularity > static totals) — must be real data',
        status: 'unproven',
      },
    ],
    defaultVariant: '3-stat-band',
    proofClass: 'proof', // zero-proof gated — every metric must be specific and attributable (B2B C4)
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero', 'how-it-works'],
    requiresPrior: ['hero', 'feature-grid'],
    contentBudgets: [
      {
        slot: 'stat-value',
        maxCharsDesktop: 16,
        maxCharsMobile: 12,
        overflowStrategy: 'reject',
      }, // e.g. "$1.9T", "33,000+"
      {
        slot: 'stat-label',
        maxCharsDesktop: 80,
        maxCharsMobile: 56,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:3 → 3→1 at sm; columns:4 → 4→2→1; full-bleed band: surface-tone shift = the designated full-bleed break (max 1/page)',
    accessibility: {
      keyboard: 'stats are semantic, no interactive targets',
      contrast: 'stat value meets AA on full-bleed surface',
      touchTarget: 'n/a (decorative/semantic)',
      reducedMotion:
        'no motion (count-up animations banned per motion budget — show final value)',
    },
    component: 'components/marketing/HomeStatQuoteSection', // legacy; first artist-recipe use requires humanOptIn
    failureModes: [
      'Unattributable or fabricated metrics (B2B anti-pattern #5: every observed metric was specific and attributable)',
      'Count-up animation (motion budget: static final value)',
      'More than one full-bleed stats band per page (emphasis budget: max 1 full-bleed break)',
    ],
    neverUse: [
      'Without verified data (zero-proof path: omit — pre-scale, skip the beat entirely per B2B candidate rule 16)',
      'Immediately after hero (illegalAfter)',
      'With more than 4 stats (cognitive overload)',
    ],
    status: 'approved',
  },

  // ── pricing ──────────────────────────────────────────────────────────────────
  {
    id: 'pricing',
    label: 'Pricing',
    requiredInputs: ['tiers'],
    optionalInputs: ['eyebrow', 'title', 'comparisonMatrix', 'faq'],
    variants: [
      {
        id: 'tier-cards-recommended',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'large',
        alignment: 'centered',
        chooseWhen:
          'tiers.length≥2 AND one tier is recommended/highlighted (B2B C7: emphasized tier)',
        exemplar: { route: '/pricing', section: 'pricing' },
        status: 'active',
      },
      {
        id: 'binary-standard-custom',
        layout: 'contained',
        media: 'none',
        columns: 2,
        density: 'large',
        alignment: 'centered',
        chooseWhen: 'tiers.length=2 (Standard vs Custom — Stripe-style)',
        exemplar: { route: '/pricing', section: 'pricing' },
        status: 'active',
      },
      {
        id: 'decision-assistant',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'tiers.length≥3 AND personas≥3 (B2B C7 variant: qualification quiz routes to recommended tier — Claude-style)',
        status: 'unproven',
      },
      {
        id: 'one-liner-link',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=artist AND recipe=artist-lp (creator R8: no pricing table on artist LP; cost-objection resolved inside CTA string)',
        exemplar: { route: '/artist-profiles', section: 'monetization' }, // artist LP embeds pricing as one line in monetization, not a pricing section
        status: 'active',
      },
    ],
    defaultVariant: 'tier-cards-recommended',
    proofClass: 'none', // pricing itself isn't proof; the proof beat between cards and matrix is gated separately
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero'], // B2B C7: pricing never before value framing — at least a headline claim or logo strip first
    requiresPrior: ['hero', 'feature-grid'], // pricing needs value framing first
    contentBudgets: [
      {
        slot: 'tier-name',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
      {
        slot: 'tier-price',
        maxCharsDesktop: 16,
        maxCharsMobile: 12,
        overflowStrategy: 'reject',
      },
      {
        slot: 'tier-feature',
        maxCharsDesktop: 60,
        maxCharsMobile: 44,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:3 → 3→1 at sm (no 2-col intermediate — comparison table below stays full-width); columns:2 → 2→1; comparison table: horizontal scroll at sm if needed',
    accessibility: {
      keyboard:
        'tier cards are <article>; "recommended" badge is aria-label; toggle (monthly/yearly) is a real <button> with aria-pressed',
      contrast:
        'all pricing text meets AA; recommended tier uses accent only on the badge/CTA',
      touchTarget: 'CTA per tier ≥44×44 at sm',
      reducedMotion:
        'toggle has no slide animation (instant swap with height-stable slot per layout-shift contract)',
    },
    component: 'components/features/pricing/MarketingPricingPlans',
    failureModes: [
      'Pricing before any value framing (B2B anti-pattern #7)',
      'Undifferentiated tiers with no recommended default (B2B anti-pattern #10)',
      'Pricing table on artist LP (creator R8: one line + link only — use one-liner-link variant)',
      'Missing FAQ/objection handling on a paid product (B2B anti-pattern #9 — Linear is the observed gap)',
    ],
    neverUse: [
      'Immediately after hero (illegalAfter hero; requires feature-grid first)',
      'On artist LP as a full table (use one-liner-link variant; cost-objection in CTA string)',
    ],
    status: 'approved',
  },

  // ── comparison ──────────────────────────────────────────────────────────────
  {
    id: 'comparison',
    label: 'Comparison',
    requiredInputs: ['competitor', 'featureRows'],
    optionalInputs: ['eyebrow', 'title', 'verdict'],
    variants: [
      {
        id: 'feature-matrix',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen: 'default for comparison-page recipe; featureRows.length≥5',
        exemplar: { route: '/compare/linktree', section: 'comparison' },
        status: 'active',
      },
      {
        id: 'side-by-side-split',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'comparison embedded in a feature page (not the comparison-page recipe); featureRows.length≤4',
        exemplar: { route: '/launch', section: 'comparison' },
        status: 'active',
      },
    ],
    defaultVariant: 'feature-matrix',
    proofClass: 'none',
    audienceLegality: [
      { legal: true },
      {
        legal: false,
        reason:
          'Comparison is illegal above the fold for audience=artist (creator R9: no problem/agitation beat; comparison near top reads as agitation)',
        audience: 'artist',
      },
    ],
    illegalAfter: ['hero', 'cta'], // comparison needs value framing first; never as a closing beat
    requiresPrior: ['hero', 'feature-grid'],
    contentBudgets: [
      {
        slot: 'feature-name',
        maxCharsDesktop: 60,
        maxCharsMobile: 44,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'cell-value',
        maxCharsDesktop: 24,
        maxCharsMobile: 16,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'feature-matrix: horizontal scroll at sm with sticky first column; side-by-side-split: stack media-below at md',
    accessibility: {
      keyboard:
        'matrix is a real <table> with <th scope>; Tab moves through interactive cells',
      contrast: 'check/X marks meet AA; Jovie column accent only on header',
      touchTarget:
        'no interactive targets in matrix; sticky column tap-to-zoom on mobile optional',
      reducedMotion: 'no motion',
    },
    component: 'content/comparisons/ComparisonData', // data-driven; render component TBD by first implementer
    failureModes: [
      'Comparison above the fold for artist audience (creator R9 violation)',
      'Fabricated competitor features (zero-proof law applies to competitor claims too)',
      'Feature-matrix with >15 rows (cognitive overload — fold into content-prose or split into two comparison sections)',
    ],
    neverUse: [
      'Above the fold when audience=artist (audienceLegality)',
      'Immediately after hero or cta (illegalAfter)',
    ],
    status: 'approved',
  },

  // ── faq ────────────────────────────────────────────────────────────────────
  {
    id: 'faq',
    label: 'FAQ',
    requiredInputs: ['items'],
    optionalInputs: ['eyebrow', 'title'],
    variants: [
      {
        id: 'objection-handler',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'placement=near-objections (after pricing on pricing-page; after proof on artist-lp) — B2B C7: FAQ near objections',
        exemplar: { route: '/artist-profiles', section: 'faq' },
        status: 'active',
      },
      {
        id: 'structured-data-list',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'recipe=seo AND items are answerable questions (FAQPage schema — about/support pages)',
        exemplar: { route: '/about', section: 'faq' },
        status: 'active',
      },
    ],
    defaultVariant: 'objection-handler',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero'], // FAQ never immediately after hero — it handles objections that arise after value/proof
    requiresPrior: ['hero', 'feature-grid'],
    contentBudgets: [
      {
        slot: 'question',
        maxCharsDesktop: 100,
        maxCharsMobile: 70,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'answer',
        maxCharsDesktop: 320,
        maxCharsMobile: 240,
        overflowStrategy: 'shrink-tier',
      },
    ],
    responsiveContract:
      'single-column always; <details>/<summary> or accordion with height-stable slots (layout-shift contract)',
    accessibility: {
      keyboard:
        '<details> is keyboard-operable by default; if custom accordion, Enter/Space toggles, arrow keys navigate',
      contrast: 'question/answer meet AA',
      touchTarget: 'summary ≥44×44 hit area',
      reducedMotion:
        'no slide animation (instant open/close with reserved height)',
    },
    component: 'components/marketing/FaqSection',
    failureModes: [
      'Missing FAQ on a paid product (B2B anti-pattern #9: Linear is the observed gap)',
      'FAQ before value/proof (handles objections that arise AFTER value, not before)',
      'Invented Q&A (zero-proof law: every Q must be a real customer question)',
    ],
    neverUse: [
      'Immediately after hero (illegalAfter)',
      'Without real question sourcing (zero-proof law)',
    ],
    status: 'approved',
  },

  // ── cta ────────────────────────────────────────────────────────────────────
  {
    id: 'cta',
    label: 'CTA',
    requiredInputs: ['headline', 'primaryCta'],
    optionalInputs: ['subhead', 'secondaryCta', 'media'],
    variants: [
      {
        id: 'final-dual-path',
        layout: 'full-bleed',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'placement=terminal (final section) AND audience≠artist (B2B C6: dual-path self-serve + talk-to-us)',
        exemplar: { route: '/artist-profiles', section: 'finalCta' },
        status: 'active',
      },
      {
        id: 'final-single-claim',
        layout: 'full-bleed',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'placement=terminal AND audience=artist (creator F: one CTA string, possession/start verb, cost-objection in button)',
        exemplar: { route: '/artist-profiles', section: 'finalCta' },
        status: 'active',
      },
      {
        id: 'mid-page-terminal',
        layout: 'contained',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'placement=mid-page after a proof beat (B2B C6: mid-page CTAs only after proof); cadence-budgeted',
        status: 'unproven',
      },
    ],
    defaultVariant: 'final-single-claim',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero'], // hero has its own CTA; mid-page terminal only after proof
    requiresPrior: ['hero', 'feature-grid'], // CTA before value is B2B anti-pattern #7
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 64,
        maxCharsMobile: 44,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'subhead',
        maxCharsDesktop: 120,
        maxCharsMobile: 90,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'cta-label',
        maxCharsDesktop: 32,
        maxCharsMobile: 24,
        overflowStrategy: 'reject',
      },
    ],
    responsiveContract:
      'full-bleed: surface-tone shift = the designated full-bleed break (max 1/page — emphasis budget); single-column always',
    accessibility: {
      keyboard:
        'CTAs are real <a>/<button> with visible focus ring; first CTA in tab order',
      contrast: 'CTA accent meets AA on dark canvas',
      touchTarget: 'CTA ≥44×44 at sm',
      reducedMotion: 'no motion',
    },
    component: 'components/marketing/MarketingFooterCta',
    failureModes: [
      'CTAs before value/proof established (B2B anti-pattern #7)',
      'Multiple competing primary asks (B2B anti-pattern #6: one primary label repeated verbatim)',
      'CTA copy rotated per section (creator F: one string repeated — B2B rotates; Jovie artist recipes do not)',
      'Final CTA without risk reversal (B2B: "Ready to get started?" + dual-path)',
    ],
    neverUse: [
      'Immediately after hero (illegalAfter; hero owns the first CTA)',
      'Before any proof beat (mid-page CTAs only after proof — B2B C6)',
      'With multiple distinct primary CTA verbs on one page (one primary label repeated — B2B C6 invariant)',
    ],
    status: 'approved',
  },

  // ── spec-wall (Jovie delta) ────────────────────────────────────────────────
  {
    id: 'spec-wall',
    label: 'Spec Wall',
    requiredInputs: ['tiles'],
    optionalInputs: ['eyebrow', 'title', 'lede'],
    variants: [
      {
        id: 'dense-compact-grid',
        layout: 'contained',
        media: 'none',
        columns: 4,
        density: 'compact',
        alignment: 'centered',
        chooseWhen:
          'default for spec-wall; tiles.length≥8 AND each tile is a short label + screenshot/icon (Jovie delta: "Details That Matter")',
        exemplar: { route: '/artist-profiles', section: 'specWall' },
        status: 'active',
      },
      {
        id: 'bento',
        layout: 'contained',
        media: 'none',
        columns: 4,
        density: 'large',
        alignment: 'centered',
        chooseWhen:
          'tiles.length≥6 AND emphasis=high (bento grid, post-2023 pattern — prior-art §3, optional fold-into-feature-grid)',
        exemplar: { route: '/new', section: 'power-grid' },
        status: 'active',
      },
    ],
    defaultVariant: 'dense-compact-grid',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero', 'cta'],
    requiresPrior: ['hero', 'feature-grid'], // spec-wall is depth after breadth
    contentBudgets: [
      {
        slot: 'tile-title',
        maxCharsDesktop: 40,
        maxCharsMobile: 28,
        overflowStrategy: 'truncate',
      },
      {
        slot: 'tile-body',
        maxCharsDesktop: 80,
        maxCharsMobile: 56,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:4 → 4→2→1 at md/sm; columns:3 → 3→2→1; bento: fixed cell sizes with grid-area, collapse to 2-col at md, 1-col at sm',
    accessibility: {
      keyboard:
        'tiles are <li> in <ul>; if interactive, Tab follows visual order',
      contrast: 'tile title/body meet AA on tokens.surface-1',
      touchTarget: 'no interactive targets unless tile is a link',
      reducedMotion: 'no motion',
    },
    component: 'components/marketing/artist-profile/ArtistProfileSpecWall',
    failureModes: [
      'Bespoke tile layout (one repeated template per section type — B2B anti-pattern #8)',
      'Tiles without screenshots (Jovie delta: spec-wall tiles carry a screenshot or icon; pure text = use feature-grid icon-list variant)',
    ],
    neverUse: [
      'Immediately after hero or cta (illegalAfter)',
      'Without a screenshot or icon per tile (use feature-grid instead)',
    ],
    status: 'approved',
  },

  // ── capture (Jovie delta) ───────────────────────────────────────────────────
  {
    id: 'capture',
    label: 'Capture',
    requiredInputs: ['headline', 'inputSlot'],
    optionalInputs: ['subhead', 'media', 'submitCta'],
    variants: [
      {
        id: 'product-demo',
        layout: 'split',
        media: 'phone',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'audience=artist AND media is a phone-framed capture demo (Jovie delta: capture is a product demo, not just a form)',
        exemplar: { route: '/artist-profiles', section: 'capture' },
        status: 'active',
      },
      {
        id: 'email-only',
        layout: 'centered',
        media: 'none',
        alignment: 'centered',
        chooseWhen:
          'audience=general OR recipe=waitlist OR recipe=blog-landing (newsletter signup)',
        status: 'unproven',
      },
    ],
    defaultVariant: 'product-demo',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero', 'cta'],
    requiresPrior: ['hero', 'feature-grid'],
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 56,
        maxCharsMobile: 40,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'subhead',
        maxCharsDesktop: 120,
        maxCharsMobile: 90,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'input-placeholder',
        maxCharsDesktop: 40,
        maxCharsMobile: 28,
        overflowStrategy: 'reject',
      },
    ],
    responsiveContract:
      'split: stack media-below at md; centered: single-column always; input full-width at sm',
    accessibility: {
      keyboard:
        'input is real <input> with <label>; submit is real <button>; form has aria-live for status',
      contrast: 'input border/placeholder meet AA',
      touchTarget: 'input ≥44px height; submit ≥44×44 at sm',
      reducedMotion:
        'submitting state is a spinner or opacity change, no layout shift (layout-shift contract — height-stable slot reserved)',
    },
    component:
      'components/marketing/artist-profile/ArtistProfileCaptureSection',
    failureModes: [
      'No submitting/success/error/already-subscribed states (Design F2: interaction states required — height-stable slots per layout-shift contract)',
      'Form without a real <label> (a11y failure)',
      'Demo-gate on creator path (creator R10: demo-gates illegal on artist-audience recipes)',
    ],
    neverUse: [
      'Immediately after hero or cta (illegalAfter)',
      'As a demo-gate on audience=artist (creator R10 — self-serve only on creator paths)',
      'Without interaction states (submitting/success/error/already-subscribed — Design F2)',
    ],
    status: 'approved',
  },

  // ── monetization (Jovie delta) ─────────────────────────────────────────────
  {
    id: 'monetization',
    label: 'Monetization',
    requiredInputs: ['headline', 'takeRate'],
    optionalInputs: ['subhead', 'caseStudy', 'pricingOneLiner', 'media'],
    variants: [
      {
        id: 'take-rate-transparency',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'audience=artist AND takeRate is real (creator R12: take-rate/pricing transparency belongs on-page — hiding economics is an anti-pattern)',
        exemplar: { route: '/artist-profiles', section: 'monetization' },
        status: 'active',
      },
      {
        id: 'earnings-story',
        layout: 'split',
        media: 'phone',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'audience=artist AND caseStudy is a named micro case with streaming-equivalence math (creator R3: "$X = Y streams")',
        status: 'unproven',
      },
    ],
    defaultVariant: 'take-rate-transparency',
    proofClass: 'none', // but the takeRate field must be real (zero-proof applies to numbers)
    audienceLegality: [
      { legal: true },
      {
        legal: false,
        reason:
          'Monetization pitch is illegal for audience=fan (fans do not monetize; they consume)',
        audience: 'fan',
      },
    ],
    illegalAfter: ['hero', 'cta'],
    requiresPrior: ['hero', 'feature-grid'], // ownership beat is a substitution for feature-split when competing with DSPs (creator R9), not a strict precondition; arc ordering enforced by artist-lp.substitutions
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 56,
        maxCharsMobile: 40,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'take-rate',
        maxCharsDesktop: 24,
        maxCharsMobile: 16,
        overflowStrategy: 'reject',
      },
      {
        slot: 'case-study-summary',
        maxCharsDesktop: 160,
        maxCharsMobile: 120,
        overflowStrategy: 'shrink-tier',
      },
    ],
    responsiveContract: 'split: stack media-below at md',
    accessibility: {
      keyboard: 'if CTA present, real <a>/<button> with focus ring',
      contrast: 'take-rate number meets AA; case-study text meets AA',
      touchTarget: 'CTA ≥44×44 at sm',
      reducedMotion: 'no motion',
    },
    component:
      'components/marketing/artist-profile/ArtistProfileMonetizationSection',
    failureModes: [
      'Hiding the take-rate (creator anti-pattern: hiding economics is a trust smell in 2024-2026 direct-to-fan)',
      'Projected personal earnings (creator R3: banned — use take-rate or named case study with streaming-equivalence math)',
      'Fabricated case-study metrics (zero-proof law)',
    ],
    neverUse: [
      'For audience=fan (audienceLegality)',
      'Without a real take-rate (zero-proof law; omit the section instead)',
      'With projected personal earnings calculators (creator R3 — banned)',
    ],
    status: 'approved',
  },

  // ── ownership (Jovie delta) ─────────────────────────────────────────────────
  {
    id: 'ownership',
    label: 'Ownership',
    requiredInputs: ['headline'],
    optionalInputs: ['subhead', 'bullets', 'media'],
    variants: [
      {
        id: 'control-block',
        layout: 'split',
        media: 'screenshot',
        mediaPosition: 'right',
        alignment: 'left',
        chooseWhen:
          'audience=artist AND recipe=artist-lp (creator R9: ownership section REQUIRED — the category core emotional differentiator vs DSPs/link-in-bio)',
        status: 'unproven', // no shipped exemplar yet — first artist-recipe implementation goes through taste feedback then promotes
      },
    ],
    defaultVariant: 'control-block',
    proofClass: 'none',
    audienceLegality: [
      { legal: true },
      {
        legal: false,
        reason:
          'Ownership/control framing is illegal for audience=fan (fans do not own data/earnings; artists do)',
        audience: 'fan',
      },
    ],
    illegalAfter: ['cta'], // ownership can follow hero (it's a value-framing beat, like logo-cloud); just not the terminal cta
    requiresPrior: ['hero'], // needs hero before it
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 64,
        maxCharsMobile: 44,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'bullet',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract: 'split: stack media-below at md',
    accessibility: {
      keyboard: 'no interactive targets unless bullets link out (then ≥44×44)',
      contrast: 'all text meets AA',
      touchTarget: 'n/a',
      reducedMotion: 'no motion',
    },
    component:
      'TBD — first implementer creates components/marketing/artist-profile/ArtistProfileOwnershipSection',
    failureModes: [
      'Generic "own your data" without the music object (creator R4: hero must be 2nd-person possessive around a music object — ownership extends this)',
      'Selling fan reach without fan ownership (creator anti-pattern — platforms that gate fan data get positioned against)',
    ],
    neverUse: [
      'For audience=fan (audienceLegality)',
      'Without the music object (use music-native nouns: releases, drops, shows, payouts — creator R5)',
    ],
    status: 'approved',
  },

  // ── content-prose ───────────────────────────────────────────────────────────
  {
    id: 'content-prose',
    label: 'Content Prose',
    requiredInputs: ['body'],
    optionalInputs: ['eyebrow', 'title', 'author', 'date'],
    variants: [
      {
        id: 'article-body',
        layout: 'contained',
        media: 'none',
        alignment: 'left',
        chooseWhen:
          'recipe=seo OR recipe=blog-landing article view (long-form prose body — 680px prose container)',
        status: 'unproven',
      },
      {
        id: 'centered-video',
        layout: 'centered',
        media: 'video',
        alignment: 'centered',
        chooseWhen:
          'recipe=launch AND cinematicMomentBudget=available (max 1/page)',
        exemplar: { route: '/launch', section: 'hero' },
        status: 'unproven',
      },
    ],
    defaultVariant: 'article-body',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: [],
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'headline',
        maxCharsDesktop: 80,
        maxCharsMobile: 60,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'paragraph',
        maxCharsDesktop: 600,
        maxCharsMobile: 480,
        overflowStrategy: 'shrink-tier',
      },
    ],
    responsiveContract:
      'max-w-prose-canonical (680px) always; single-column; images full-width within prose container',
    accessibility: {
      keyboard:
        'headings are real <h2>/<h3> in order; links are <a> with focus ring',
      contrast:
        'prose meets AA on dark canvas (tokens.text-primary/secondary per DESIGN.md)',
      touchTarget: 'links ≥44×44 hit area at sm',
      reducedMotion: 'no motion',
    },
    component: 'apps/web/app/(marketing)/blog/[slug]/BlogPostPage', // body render; first feature use requires component extraction
    failureModes: [
      'Exceeding prose max-width (readability — 680px is the canonical per DESIGN.md)',
      'Missing heading hierarchy (a11y)',
    ],
    neverUse: [
      'On a conversion-page recipe as the primary body (conversion pages use feature-grid/feature-split, not prose)',
    ],
    status: 'approved',
  },

  // ── blog-feed ───────────────────────────────────────────────────────────────
  {
    id: 'blog-feed',
    label: 'Blog Feed',
    requiredInputs: ['posts'],
    optionalInputs: ['eyebrow', 'title', 'featuredPost'],
    variants: [
      {
        id: 'featured-grid',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'large',
        alignment: 'centered',
        chooseWhen:
          'recipe=blog-landing AND featuredPost present + posts.length≥3',
        exemplar: { route: '/blog', section: 'blog-feed' },
        status: 'active',
      },
      {
        id: 'category-filtered-grid',
        layout: 'contained',
        media: 'none',
        columns: 3,
        density: 'compact',
        alignment: 'centered',
        chooseWhen: 'recipe=blog-landing category variant AND posts.length≥6',
        exemplar: { route: '/blog/category/[slug]', section: 'blog-feed' },
        status: 'active',
      },
    ],
    defaultVariant: 'featured-grid',
    proofClass: 'none',
    audienceLegality: [{ legal: true }],
    illegalAfter: ['hero'],
    requiresPrior: ['hero'],
    contentBudgets: [
      {
        slot: 'post-title',
        maxCharsDesktop: 80,
        maxCharsMobile: 56,
        overflowStrategy: 'shrink-tier',
      },
      {
        slot: 'post-excerpt',
        maxCharsDesktop: 160,
        maxCharsMobile: 120,
        overflowStrategy: 'truncate',
      },
    ],
    responsiveContract:
      'columns:3 → 3→2→1 at md/sm; featured post spans full width above grid at md+',
    accessibility: {
      keyboard:
        'cards are <article> with real <a> to post; Tab follows visual order',
      contrast: 'title/excerpt meet AA',
      touchTarget: 'card link ≥44×44 hit area at sm',
      reducedMotion: 'no motion',
    },
    component: 'apps/web/app/(marketing)/blog/BlogCard',
    failureModes: [
      'Empty feed (require at least 3 posts; if fewer, omit the section — zero-proof analog for content)',
      'Missing featured post on a high-traffic blog-landing (featured post is the editorial emphasis)',
    ],
    neverUse: [
      'Immediately after hero (illegalAfter — hero is for the page promise, not the feed)',
      'With <3 posts (omit the section)',
    ],
    status: 'approved',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers (used by composition.ts + the manifest gate)
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_BY_ID: Readonly<Record<MarketingSectionId, MarketingSection>> =
  Object.fromEntries(MARKETING_SECTIONS.map(s => [s.id, s])) as Readonly<
    Record<MarketingSectionId, MarketingSection>
  >;

export function getMarketingSection(id: MarketingSectionId): MarketingSection {
  const section = SECTION_BY_ID[id];
  if (!section) {
    throw new Error(`marketing section not found: ${id}`);
  }
  return section;
}

export function isLegalAfter(
  section: MarketingSectionId,
  immediatelyPreceding: MarketingSectionId
): boolean {
  const def = getMarketingSection(section);
  // illegalAfter = "cannot IMMEDIATELY follow" — the section cannot be placed
  // directly after any of its illegalAfter entries. It CAN appear later in the page.
  return !def.illegalAfter?.includes(immediatelyPreceding);
}

export function hasRequiredPrior(
  section: MarketingSectionId,
  priorSections: readonly MarketingSectionId[]
): boolean {
  const def = getMarketingSection(section);
  return (def.requiresPrior ?? []).every(required =>
    priorSections.includes(required)
  );
}

export function isLegalForAudience(
  section: MarketingSectionId,
  audience: MarketingAudience
): boolean {
  const def = getMarketingSection(section);
  return def.audienceLegality.every(
    rule => rule.legal || rule.audience !== audience
  );
}

export function isProofClass(section: MarketingSectionId): boolean {
  const def = getMarketingSection(section);
  return def.proofClass === 'proof' || def.proofClass === 'trust';
}

export function getVariants(
  section: MarketingSectionId
): readonly MarketingVariant[] {
  return getMarketingSection(section).variants;
}

export function getDefaultVariant(section: MarketingSectionId): string {
  return getMarketingSection(section).defaultVariant;
}

export function getVariant(
  section: MarketingSectionId,
  variantId: string
): MarketingVariant | null {
  return (
    getMarketingSection(section).variants.find(v => v.id === variantId) ?? null
  );
}
