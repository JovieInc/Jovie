/**
 * Marketing Recipe Registry — typed taxonomy of every page recipe Jovie may
 * compose. Owns ALL normative rules for recipes per the amended charter:
 * section order, emotional arc, arc-gated legality, CTA cadence, page hierarchy
 * contract, emphasis budget, above-the-fold composition, content density
 * bounds, decision tree, fallbacks. Docs under docs/marketing/ own rationale only.
 *
 * Recipes are TWO-TIER (charter delta #5, Design F10):
 *   - proven: has a shipped reference route; fully specified; CI asserts the
 *             reference route declares this recipeId in routeManifest.ts.
 *   - stub:   order + arc only; first implementation goes through human taste
 *             feedback (humanOptIn manifest field per DX2), then promotes to proven.
 *
 * Charter's 11 recipes are all kept (T1 resolution: keep all 11, two-tier).
 */

import type { MarketingAudience, MarketingSectionId } from './sections';

export type RecipeId =
  | 'homepage'
  | 'pricing'
  | 'artist-lp'
  | 'feature'
  | 'agency-lp'
  | 'enterprise'
  | 'comparison'
  | 'launch'
  | 'waitlist'
  | 'seo'
  | 'blog-landing';

export const MARKETING_RECIPE_IDS: readonly RecipeId[] = [
  'homepage',
  'pricing',
  'artist-lp',
  'feature',
  'agency-lp',
  'enterprise',
  'comparison',
  'launch',
  'waitlist',
  'seo',
  'blog-landing',
] as const;

export type RecipeStatus = 'proven' | 'stub';

/**
 * Emotional arc beat — a recipe primitive (charter design law, Design F3).
 * Each beat is a (feeling, section) pair; the section legality changes by
 * audience input (e.g. audience=artist → Problem illegal, Comparison illegal
 * above fold per creator R9).
 */
export interface ArcBeat {
  readonly beat: string; // e.g. 'recognition', 'aspiration', 'problem', 'solution'
  readonly feeling: string; // what the visitor feels at this beat
  /** Section id that typically carries this beat. Null = optional/conditional. */
  readonly section: MarketingSectionId | null;
}

/**
 * Page Hierarchy Contract — one big idea per page (Design F1).
 * - seeFirst: the one thing the visitor must see first
 * - second/third: ordered secondary ideas
 * - emphasisBudget: max 1 display-scale moment, capped full-bleed breaks, 1 hero-weight proof element
 */
export interface PageHierarchyContract {
  readonly oneBigIdea: string;
  readonly seeFirst: MarketingSectionId;
  readonly second: MarketingSectionId | null;
  readonly third: MarketingSectionId | null;
  readonly emphasisBudget: {
    readonly maxDisplayScaleMoments: 1; // exactly 1 — the hero
    readonly maxFullBleedBreaks: 1; // exactly 1 — the final CTA or the stats band
    readonly maxHeroWeightProofElements: 1; // exactly 1 — hero media is the hero-weight proof
  };
  /**
   * Above-the-fold composition assertion: hero + first proof beat + primary
   * CTA co-visible at 1440×900 and 390×844 (Design F1). Stated as a contract
   * the manifest gate can statically assert per-recipe.
   */
  readonly aboveTheFoldContract: {
    readonly desktop: readonly MarketingSectionId[]; // [hero, firstProofBeat?, cta-in-hero]
    readonly mobile: readonly MarketingSectionId[];
  };
}

/**
 * CTA cadence — a declared budget (charter design law, B2B C6).
 * Either sparse (≤3, hero + close) or dense-tiered (one primary label repeated
 * verbatim, all others visually tertiary). Mid-page CTAs only after proof beats.
 */
export interface CtaCadence {
  readonly strategy: 'sparse' | 'dense-tiered';
  /** Primary CTA label — REPEATED VERBATIM throughout the page (B2B C6 invariant). */
  readonly primaryLabel: string;
  /** Secondary CTA (navigational, never visually competes with primary). */
  readonly secondaryLabel?: string;
  readonly cadence:
    | 'hero-only'
    | 'hero-and-close'
    | 'every-2-3-sections-after-proof';
}

/**
 * A recipe — section order + arc + decision tree + hierarchy + cadence.
 */
export interface MarketingRecipe {
  readonly id: RecipeId;
  readonly label: string;
  readonly status: RecipeStatus;
  /** Reference route — required iff status='proven' (CI asserts in routeManifest). */
  readonly referenceRoute?: string;
  /** Ordered section ids. The canonical section sequence for this recipe. */
  readonly sectionOrder: readonly MarketingSectionId[];
  /** Emotional arc — beats in order (Design F3). Section legality derives from this. */
  readonly arc: readonly ArcBeat[];
  /** Page hierarchy contract (Design F1). */
  readonly hierarchy: PageHierarchyContract;
  /** CTA cadence (B2B C6 + creator F). */
  readonly ctaCadence: CtaCadence;
  /**
   * Audience this recipe serves (drives section legality via audienceLegality
   * in sections.ts + arc-gated legality here).
   */
  readonly audience: MarketingAudience;
  /** Optional substitutions: sections that may be swapped per brief inputs. */
  readonly substitutions?: readonly {
    readonly replace: MarketingSectionId;
    readonly with: MarketingSectionId;
    readonly when: string; // human-readable predicate; canonical in composition.ts decision table
  }[];
  /** Fallbacks when a required input is missing. */
  readonly fallbacks?: readonly {
    readonly missing: string; // input name
    readonly fallback: string; // action: 'omit section X' | 'use variant Y' | 'fail'
  }[];
  /** Minimum content bounds (sections + inputs that MUST be present). */
  readonly minContent: readonly string[];
  /** Maximum content bounds (page-length cap — long-form/campaign rules per charter P4). */
  readonly maxContent: {
    readonly maxSections: number;
    readonly maxLongFormSections?: number; // for SEO/launch recipes that allow long-form
  };
  /**
   * Decision tree — deterministic recipe SELECTION rule. Stated as a
   * human-readable predicate; canonical executable form is the decision
   * table in composition.ts. The manifest gate asserts every reachable Brief
   * resolves to exactly one recipe.
   */
  readonly chooseWhen: string;
  /** When this recipe should NEVER be used. */
  readonly neverUse: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The recipe registry
// ─────────────────────────────────────────────────────────────────────────────

export const MARKETING_RECIPES: readonly MarketingRecipe[] = [
  // ── homepage (proven — reference: /new per codebase-baseline §2.2) ─────────
  {
    id: 'homepage',
    label: 'Homepage',
    status: 'proven',
    referenceRoute: '/new', // richest shipped homepage composition; live '/' currently renders hero-only
    audience: 'general',
    sectionOrder: [
      'hero',
      'logo-cloud',
      'feature-split', // system overview
      'feature-split', // spotlight (adaptive)
      'feature-split', // capture + reactivation fused
      'spec-wall',
      'social-proof',
      'pricing',
      'cta',
    ],
    arc: [
      { beat: 'promise', feeling: 'this is what Jovie is', section: 'hero' },
      { beat: 'permission', feeling: 'others trust it', section: 'logo-cloud' },
      {
        beat: 'comprehension',
        feeling: 'how it works at a glance',
        section: 'feature-split',
      },
      {
        beat: 'depth',
        feeling: 'I see the product in action',
        section: 'feature-split',
      },
      {
        beat: 'capability',
        feeling: 'I could use this for capture/reactivation',
        section: 'feature-split',
      },
      { beat: 'detail', feeling: 'the specifics matter', section: 'spec-wall' },
      {
        beat: 'belief',
        feeling: 'real artists use this',
        section: 'social-proof',
      },
      { beat: 'price', feeling: 'what does it cost', section: 'pricing' },
      { beat: 'action', feeling: 'ready to start', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie is the artist platform that captures every fan and reactivates them automatically',
      seeFirst: 'hero',
      second: 'feature-split',
      third: 'spec-wall',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'], // hero carries headline + CTA + phone media (hero-weight proof)
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      secondaryLabel: 'See a live profile',
      cadence: 'hero-and-close',
    },
    substitutions: [
      {
        replace: 'social-proof',
        with: 'stats',
        when: 'socialProof verified data absent but stats aggregate verified',
      },
      {
        replace: 'pricing',
        with: 'monetization',
        when: 'audience=artist (one-liner-link variant, not a full pricing table)',
      },
    ],
    fallbacks: [
      {
        missing: 'social-proof verified data',
        fallback: 'omit section social-proof (zero-proof path)',
      },
      {
        missing: 'stats verified data',
        fallback: 'omit section stats (zero-proof path)',
      },
      {
        missing: 'logo-cloud verified logos',
        fallback: 'omit section logo-cloud (zero-proof path)',
      },
    ],
    minContent: [
      'hero.headline',
      'hero.primaryCta',
      'cta.headline',
      'cta.primaryCta',
    ],
    maxContent: { maxSections: 12 },
    chooseWhen:
      'traffic=home OR (audience=general AND intent=category AND conversion=start)',
    neverUse: [
      'For audience=artist specifically (use artist-lp recipe — the arc differs)',
      'As a feature page (use feature recipe — narrower scope, deeper demo)',
    ],
  },

  // ── pricing (proven — reference: /pricing) ──────────────────────────────────
  {
    id: 'pricing',
    label: 'Pricing',
    status: 'proven',
    referenceRoute: '/pricing',
    audience: 'general',
    sectionOrder: [
      'hero',
      'pricing',
      'social-proof',
      'comparison',
      'faq',
      'cta',
    ],
    arc: [
      { beat: 'frame', feeling: 'here is the price', section: 'hero' },
      { beat: 'tiers', feeling: 'which tier fits me', section: 'pricing' },
      {
        beat: 'trust',
        feeling: 'real customers paid this',
        section: 'social-proof',
      },
      {
        beat: 'compare',
        feeling: 'how do tiers differ in detail',
        section: 'comparison',
      },
      { beat: 'objection', feeling: 'what is the catch', section: 'faq' },
      { beat: 'action', feeling: 'ready to start', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie pricing is simple: one recommended tier, full comparison, no hidden fees',
      seeFirst: 'hero',
      second: 'pricing',
      third: 'comparison',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero', 'pricing'], // tier cards visible without scroll
        mobile: ['hero', 'pricing'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      secondaryLabel: 'Contact sales',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'social-proof verified data',
        fallback:
          'omit section social-proof (B2B C7: proof beat between cards and matrix — but zero-proof wins)',
      },
      {
        missing: 'comparison featureRows',
        fallback: 'omit section comparison (degrades to tier-cards + faq only)',
      },
    ],
    minContent: ['pricing.tiers', 'faq.items', 'cta.headline'],
    maxContent: { maxSections: 8 },
    chooseWhen: 'intent=price AND conversion=start OR upgrade',
    neverUse: [
      'Without FAQ (B2B anti-pattern #9: Linear is the observed gap — every other property carries FAQ)',
      'On artist LP as a full pricing table (use artist-lp recipe with monetization one-liner instead — creator R8)',
    ],
  },

  // ── artist-lp (proven — reference: /artist-profiles) ───────────────────────
  {
    id: 'artist-lp',
    label: 'Artist Landing Page',
    status: 'proven',
    referenceRoute: '/artist-profiles', // canonical; /artist-profile is an alias (routeManifest marks alias not second instance)
    audience: 'artist',
    // Order per codebase-baseline §2.4 (reconciles ARTIST_PROFILE_SECTION_ORDER drift with shipped render).
    // Note: shipped render merges hero+adaptive and drops standalone trust in FULL_PAGE — manifest test
    // binds to shipped render order, not aspirational list. trust only renders in !FULL_PAGE short-circuit.
    sectionOrder: [
      'hero',
      'feature-split', // adaptive (One Profile)
      'feature-grid', // outcomes (Built for Artists)
      'capture',
      'feature-split', // reactivation
      'monetization',
      'spec-wall',
      'how-it-works',
      'social-proof',
      'faq',
      'cta',
    ],
    arc: [
      // Creator-economy R9: recognition → identity → aspiration → capability → money-reality → relatability → low-risk action
      // No problem/agitation beat — illegal for artist audience.
      {
        beat: 'recognition',
        feeling: 'this is for people like me (my music, my fans)',
        section: 'hero',
      },
      {
        beat: 'identity',
        feeling: 'that could be MY page',
        section: 'feature-split',
      },
      {
        beat: 'aspiration',
        feeling: 'artists I admire are here',
        section: 'feature-grid',
      },
      {
        beat: 'capability',
        feeling: 'I can capture every fan',
        section: 'capture',
      },
      {
        beat: 'capability',
        feeling: 'I can reactivate them automatically',
        section: 'feature-split',
      },
      {
        beat: 'money-reality',
        feeling: 'real people earn from this; here is the take-rate',
        section: 'monetization',
      },
      { beat: 'detail', feeling: 'the specifics matter', section: 'spec-wall' },
      {
        beat: 'low-risk',
        feeling: 'I can be live in 60 seconds',
        section: 'how-it-works',
      },
      {
        beat: 'relatability',
        feeling: 'even small artists succeed — so can I',
        section: 'social-proof',
      },
      {
        beat: 'permission',
        feeling: 'my objections are answered',
        section: 'faq',
      },
      {
        beat: 'action',
        feeling: 'nothing to lose, claim it now',
        section: 'cta',
      },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie is the one profile that captures every fan and reactivates them automatically — own your fans, keep more earnings',
      seeFirst: 'hero',
      second: 'feature-split', // adaptive
      third: 'capture',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'], // hero carries phone-framed profile media (hero-weight proof) + claim CTA
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'dense-tiered',
      primaryLabel: 'Claim your Jovie', // possession verb (creator F); cost-objection in button: "Try N days free" / "It's free"
      cadence: 'every-2-3-sections-after-proof', // creator F: free-entry offers repeat cadence high; attach to feature beats for paid-only
    },
    substitutions: [
      {
        replace: 'feature-split',
        with: 'ownership',
        when: 'competing with DSPs/link-in-bio (creator R9: ownership section REQUIRED as emotional differentiator)',
      },
    ],
    fallbacks: [
      {
        missing: 'social-proof verified data',
        fallback:
          'omit section social-proof (zero-proof path; substitute = screenshot-registry product render)',
      },
      {
        missing: 'monetization real take-rate',
        fallback:
          'omit section monetization (zero-proof law — pre-scale, skip the beat entirely)',
      },
      {
        missing: 'hero phone asset',
        fallback:
          'use hero variant centered-none (degradation ladder: product-screenshot tier 3 = OMIT visual)',
      },
    ],
    minContent: [
      'hero.headline',
      'hero.primaryCta',
      'cta.headline',
      'cta.primaryCta',
    ],
    maxContent: { maxSections: 13 },
    chooseWhen:
      'audience=artist AND intent=artist-profile AND conversion=claim-handle OR claim-profile',
    neverUse: [
      'With a problem-agitation section (creator R9: artist arc has no problem beat)',
      'With comparison above the fold (creator R9: comparison reads as agitation near top)',
      'With founder-first proof near the top (DESIGN.md ui.md smell — use product-render only near top)',
      'With a demo-gate or "book a demo" CTA (creator R10: self-serve only on creator paths)',
      'With enterprise/security/ROI-calculator sections (creator R10: illegal on artist-audience recipes)',
      'With a full pricing table (creator R8: one-liner + link; cost-objection in CTA string)',
      'With quotes from famous artists (creator R5: famous=profiles, quotes=small/relatable)',
    ],
  },

  // ── feature (proven — reference: /artist-notifications) ────────────────────
  {
    id: 'feature',
    label: 'Feature Page',
    status: 'proven',
    referenceRoute: '/artist-notifications', // also /download, /pay, /voice (noindex)
    audience: 'artist',
    // Per codebase-baseline §2.5 — feature page grammar = homepage grammar at depth-1 (B2B C8).
    sectionOrder: [
      'hero',
      'logo-cloud',
      'capture',
      'feature-split', // reactivation reused
      'feature-grid', // benefits (artist-notifications benefits section)
      'spec-wall',
      'faq',
      'cta',
    ],
    arc: [
      {
        beat: 'promise',
        feeling: 'this is the specific capability',
        section: 'hero',
      },
      { beat: 'permission', feeling: 'others trust it', section: 'logo-cloud' },
      {
        beat: 'capability',
        feeling: 'I can capture fans with this feature',
        section: 'capture',
      },
      {
        beat: 'capability',
        feeling: 'and reactivate them',
        section: 'feature-split',
      },
      {
        beat: 'breadth',
        feeling: 'what else it does',
        section: 'feature-grid',
      },
      { beat: 'detail', feeling: 'the specifics matter', section: 'spec-wall' },
      { beat: 'objection', feeling: 'my questions answered', section: 'faq' },
      { beat: 'action', feeling: 'ready to try', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'This one capability does X for you (one promise, narrower than homepage)',
      seeFirst: 'hero',
      second: 'feature-split',
      third: 'spec-wall',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'],
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'dense-tiered',
      primaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    substitutions: [
      {
        replace: 'logo-cloud',
        with: 'feature-split',
        when: 'audience=artist AND no logos (degradation: trust proof = product render)',
      },
    ],
    fallbacks: [
      {
        missing: 'logo-cloud verified logos',
        fallback: 'omit section logo-cloud (zero-proof path)',
      },
    ],
    minContent: ['hero.headline', 'hero.primaryCta', 'cta.headline'],
    maxContent: { maxSections: 10 },
    chooseWhen:
      'intent=feature AND conversion=start (one promise, deeper demo than homepage)',
    neverUse: [
      'As a retelling of the whole company story (B2B anti-pattern #14: feature pages go deep on one promise)',
      'With audience=general as the primary (feature pages assume the category framing already happened on homepage)',
    ],
  },

  // ── agency-lp (stub — no shipped reference) ────────────────────────────────
  {
    id: 'agency-lp',
    label: 'Agency Landing Page',
    status: 'stub',
    audience: 'agency',
    // Stub: order + arc only; first implementation goes through taste feedback then promotes (Design F10).
    sectionOrder: [
      'hero',
      'logo-cloud',
      'feature-grid',
      'feature-split',
      'social-proof',
      'pricing',
      'faq',
      'cta',
    ],
    arc: [
      {
        beat: 'promise',
        feeling: 'Jovie for agencies managing multiple artists',
        section: 'hero',
      },
      {
        beat: 'permission',
        feeling: 'agencies trust it',
        section: 'logo-cloud',
      },
      {
        beat: 'breadth',
        feeling: 'what it does for my roster',
        section: 'feature-grid',
      },
      {
        beat: 'depth',
        feeling: 'how it works for one artist',
        section: 'feature-split',
      },
      {
        beat: 'belief',
        feeling: 'agencies like mine use this',
        section: 'social-proof',
      },
      { beat: 'price', feeling: 'agency pricing', section: 'pricing' },
      { beat: 'objection', feeling: 'my questions answered', section: 'faq' },
      { beat: 'action', feeling: 'ready to talk', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie lets agencies manage every artist fan lifecycle from one dashboard',
      seeFirst: 'hero',
      second: 'feature-grid',
      third: 'social-proof',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'],
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Talk to us', // agency sales motion — NOT self-serve claim
      secondaryLabel: 'See a demo roster',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'logo-cloud verified logos',
        fallback: 'omit section logo-cloud (zero-proof path)',
      },
      {
        missing: 'social-proof verified data',
        fallback: 'omit section social-proof (zero-proof path)',
      },
    ],
    minContent: ['hero.headline', 'hero.primaryCta', 'cta.headline'],
    maxContent: { maxSections: 11 },
    chooseWhen: 'audience=agency AND conversion=book-demo OR start',
    neverUse: [
      'With the artist-arc CTA verbs (agency path is sales-led, not claim-led)',
      'Without a real demo roster asset (degradation: screenshot-registry product render of multi-artist view)',
    ],
  },

  // ── enterprise (stub) ──────────────────────────────────────────────────────
  {
    id: 'enterprise',
    label: 'Enterprise',
    status: 'stub',
    audience: 'enterprise-buyer',
    sectionOrder: [
      'hero',
      'logo-cloud',
      'feature-split',
      'stats',
      'social-proof',
      'comparison',
      'faq',
      'cta',
    ],
    arc: [
      {
        beat: 'promise',
        feeling: 'enterprise-grade artist platform',
        section: 'hero',
      },
      {
        beat: 'permission',
        feeling: 'named enterprises trust it',
        section: 'logo-cloud',
      },
      {
        beat: 'depth',
        feeling: 'how it works at enterprise scale',
        section: 'feature-split',
      },
      { beat: 'scale', feeling: 'the numbers', section: 'stats' },
      {
        beat: 'belief',
        feeling: 'enterprise case studies',
        section: 'social-proof',
      },
      { beat: 'compare', feeling: 'vs alternatives', section: 'comparison' },
      {
        beat: 'objection',
        feeling: 'security/compliance/contract questions',
        section: 'faq',
      },
      { beat: 'action', feeling: 'ready to talk', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie at enterprise scale — security, compliance, multi-team',
      seeFirst: 'hero',
      second: 'feature-split',
      third: 'stats',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'],
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Contact sales',
      secondaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'logo-cloud verified logos',
        fallback: 'omit section logo-cloud (zero-proof path)',
      },
      {
        missing: 'stats verified data',
        fallback:
          'omit section stats (zero-proof path — pre-scale, skip the beat entirely)',
      },
      {
        missing: 'social-proof verified data',
        fallback: 'omit section social-proof (zero-proof path)',
      },
    ],
    minContent: ['hero.headline', 'hero.primaryCta', 'cta.headline'],
    maxContent: { maxSections: 10 },
    chooseWhen: 'audience=enterprise-buyer AND conversion=contact-sales',
    neverUse: [
      'For audience=artist (creator R10: enterprise sections illegal on artist-audience recipes)',
      'Without verified enterprise customer proof (zero-proof path: omit stats/social-proof)',
    ],
  },

  // ── comparison (proven — reference: /compare/linktree) ──────────────────────
  {
    id: 'comparison',
    label: 'Comparison',
    status: 'proven',
    referenceRoute: '/compare/linktree', // also /alternatives/link-in-bio, /alternatives/linktree
    audience: 'general',
    sectionOrder: ['hero', 'comparison', 'feature-grid', 'faq', 'cta'],
    arc: [
      { beat: 'frame', feeling: 'Jovie vs X', section: 'hero' },
      { beat: 'compare', feeling: 'feature-by-feature', section: 'comparison' },
      {
        beat: 'breadth',
        feeling: 'what else Jovie does',
        section: 'feature-grid',
      },
      { beat: 'objection', feeling: 'my questions', section: 'faq' },
      { beat: 'action', feeling: 'try Jovie', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea: 'Jovie beats X on these specific dimensions',
      seeFirst: 'hero',
      second: 'comparison',
      third: 'feature-grid',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero', 'comparison'], // verdict visible without scroll
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'comparison featureRows',
        fallback: 'fail (comparison is the point — do not ship without it)',
      },
      {
        missing: 'competitor verified feature data',
        fallback: 'fail (zero-proof law applies to competitor claims too)',
      },
    ],
    minContent: [
      'comparison.competitor',
      'comparison.featureRows',
      'cta.headline',
    ],
    maxContent: { maxSections: 7 },
    chooseWhen:
      'intent=compare AND conversion=start (SEO programmatic from content/comparisons/ or content/alternatives/)',
    neverUse: [
      'With fabricated competitor features (zero-proof law)',
      'For audience=artist above the fold (creator R9: comparison near top reads as agitation)',
    ],
  },

  // ── launch (proven — reference: /launch) ───────────────────────────────────
  {
    id: 'launch',
    label: 'Launch',
    status: 'proven',
    referenceRoute: '/launch', // long-form launch narrative; 10 inline <section> blocks
    audience: 'general',
    // Per codebase-baseline §2.6 — launch is a long-form recipe allowing content-prose beats.
    sectionOrder: [
      'hero',
      'logo-cloud', // supported platforms
      'feature-split', // thesis
      'feature-split', // profile
      'feature-split', // smart links
      'feature-split', // deeplinks
      'feature-split', // AI
      'feature-split', // audience
      'content-prose', // why now (editorial)
      'comparison',
      'cta',
    ],
    arc: [
      { beat: 'announce', feeling: 'this is the launch', section: 'hero' },
      {
        beat: 'permission',
        feeling: 'platforms supported',
        section: 'logo-cloud',
      },
      { beat: 'thesis', feeling: 'why this exists', section: 'feature-split' },
      {
        beat: 'capability',
        feeling: 'profile, smart links, deeplinks, AI, audience',
        section: 'feature-split',
      },
      {
        beat: 'why-now',
        feeling: 'the editorial argument',
        section: 'content-prose',
      },
      { beat: 'compare', feeling: 'vs alternatives', section: 'comparison' },
      { beat: 'action', feeling: 'get it now', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'Jovie launches X — here is the thesis, the capabilities, and why now',
      seeFirst: 'hero',
      second: 'feature-split',
      third: 'content-prose',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'],
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'logo-cloud verified logos',
        fallback:
          'omit section logo-cloud (zero-proof path — launch can ship without a logo strip; the announcement is the proof)',
      },
    ],
    minContent: ['hero.headline', 'hero.primaryCta', 'cta.headline'],
    maxContent: { maxSections: 14, maxLongFormSections: 2 }, // allows up to 2 content-prose beats
    chooseWhen:
      'intent=launch AND conversion=start (announcement + long-form narrative)',
    neverUse: [
      'With more than 2 content-prose beats (long-form cap; emphasis budget)',
      'Without a real launch moment (launch recipes date-stamp the announcement)',
    ],
  },

  // ── waitlist (stub — no shipped (marketing) reference; app/waitlist exists outside group) ─
  {
    id: 'waitlist',
    label: 'Waitlist',
    status: 'stub',
    audience: 'general',
    sectionOrder: ['hero', 'capture', 'faq', 'cta'],
    arc: [
      { beat: 'promise', feeling: 'early access', section: 'hero' },
      { beat: 'capture', feeling: 'join the waitlist', section: 'capture' },
      { beat: 'objection', feeling: 'my questions', section: 'faq' },
      { beat: 'action', feeling: 'request access', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea: 'Join the Jovie waitlist for early access',
      seeFirst: 'hero',
      second: 'capture',
      third: 'faq',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero', 'capture'], // capture form visible without scroll
        mobile: ['hero', 'capture'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Request access',
      cadence: 'hero-only', // capture IS the conversion — no competing CTA
    },
    minContent: ['hero.headline', 'capture.inputSlot'],
    maxContent: { maxSections: 5 },
    chooseWhen: 'conversion=request-access AND WAITLIST_ENABLED=true',
    neverUse: [
      'With multiple competing CTAs (capture is the conversion — one input, one submit)',
      'Without interaction states on capture (Design F2: submitting/success/error/already-subscribed)',
    ],
  },

  // ── seo (proven — reference: /about; also /support) ────────────────────────
  {
    id: 'seo',
    label: 'SEO',
    status: 'proven',
    referenceRoute: '/about', // also /support
    audience: 'general',
    // Per codebase-baseline — /about and /support use MarketingHero + FaqSection + schemas.
    sectionOrder: ['hero', 'content-prose', 'faq', 'cta'],
    arc: [
      { beat: 'frame', feeling: 'what is this about', section: 'hero' },
      { beat: 'depth', feeling: 'the answer', section: 'content-prose' },
      { beat: 'objection', feeling: 'related questions', section: 'faq' },
      { beat: 'action', feeling: 'next step', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea: 'A specific question answered with FAQPage schema for SEO',
      seeFirst: 'hero',
      second: 'content-prose',
      third: 'faq',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero'],
        mobile: ['hero'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    substitutions: [
      {
        replace: 'content-prose',
        with: 'faq',
        when: 'SEO page is a pure FAQ page (about/support — FaqSection carries the answer)',
      },
    ],
    minContent: ['hero.headline', 'faq.items'], // FAQPage schema is the SEO point
    maxContent: { maxSections: 6, maxLongFormSections: 2 },
    chooseWhen:
      'intent=informational AND conversion=start OR none (FAQ schema + structured data)',
    neverUse: [
      'Without FAQPage schema (the whole point of this recipe is structured data)',
      'With more than 2 content-prose beats (long-form cap)',
    ],
  },

  // ── blog-landing (proven — reference: /blog; also /blog/category/[slug]) ────
  {
    id: 'blog-landing',
    label: 'Blog Landing',
    status: 'proven',
    referenceRoute: '/blog', // also /blog/category/[slug]
    audience: 'general',
    sectionOrder: ['hero', 'blog-feed', 'capture', 'cta'],
    arc: [
      { beat: 'frame', feeling: 'the Jovie blog', section: 'hero' },
      { beat: 'browse', feeling: 'posts to read', section: 'blog-feed' },
      { beat: 'subscribe', feeling: 'get updates', section: 'capture' },
      { beat: 'action', feeling: 'next step', section: 'cta' },
    ],
    hierarchy: {
      oneBigIdea:
        'The Jovie blog — posts for artists and the team behind Jovie',
      seeFirst: 'hero',
      second: 'blog-feed',
      third: 'capture',
      emphasisBudget: {
        maxDisplayScaleMoments: 1,
        maxFullBleedBreaks: 1,
        maxHeroWeightProofElements: 1,
      },
      aboveTheFoldContract: {
        desktop: ['hero', 'blog-feed'], // featured post + first row visible without scroll
        mobile: ['hero', 'blog-feed'],
      },
    },
    ctaCadence: {
      strategy: 'sparse',
      primaryLabel: 'Get started',
      cadence: 'hero-and-close',
    },
    fallbacks: [
      {
        missing: 'blog-feed posts <3',
        fallback:
          'fail (blog-landing requires ≥3 posts — omit the section means no blog)',
      },
    ],
    minContent: ['hero.headline', 'blog-feed.posts'],
    maxContent: { maxSections: 6 },
    chooseWhen: 'intent=blog-index AND conversion=start OR subscribe',
    neverUse: [
      'With <3 blog posts (zero-proof analog for content — omit the section means no blog)',
      'With capture as the primary conversion (blog-landing primary = read posts; capture = secondary newsletter signup)',
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers (used by composition.ts + the manifest gate)
// ─────────────────────────────────────────────────────────────────────────────

const RECIPE_BY_ID: Readonly<Record<RecipeId, MarketingRecipe>> =
  Object.fromEntries(MARKETING_RECIPES.map(r => [r.id, r])) as Readonly<
    Record<RecipeId, MarketingRecipe>
  >;

export function getMarketingRecipe(id: RecipeId): MarketingRecipe {
  const recipe = RECIPE_BY_ID[id];
  if (!recipe) {
    throw new Error(`marketing recipe not found: ${id}`);
  }
  return recipe;
}

export function isProvenRecipe(id: RecipeId): boolean {
  return getMarketingRecipe(id).status === 'proven';
}

export function getRecipeSectionOrder(
  id: RecipeId
): readonly MarketingSectionId[] {
  return getMarketingRecipe(id).sectionOrder;
}
