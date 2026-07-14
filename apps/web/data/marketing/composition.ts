/**
 * Marketing Composition — the executable decision engine.
 *
 * Per the amended charter (D1=B, DX1, CEO theme 1), this file owns the
 * normative decision data: the typed decision table that maps a Brief to
 * (recipeId, sectionId[], variantId[], CTA positions) deterministically.
 *
 * Determinism boundary (D1=B):
 *   - DETERMINISTIC (machine): recipe, section order, variants, CTA cadence.
 *   - BOUNDED TASTE (human, post-ship feedback): imagery-within-ladder,
 *     density, copy.
 *
 * The output is a MarketingComposition tuple (E9) with an owned Zod schema
 * (DX11) that all consumers (manifest gate, golden-fixture determinism tests,
 * blind-brief validation gate) reference.
 *
 * No subjective decisions remain in the structural outputs. Every chooseWhen
 * predicate in sections.ts and recipes.ts has its executable canonical form
 * in the decision table below.
 */

import { z } from 'zod';
import { getMarketingRecipe, type RecipeId } from './recipes';
import {
  getMarketingSection,
  hasRequiredPrior,
  isLegalForAudience,
  isProofClass,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
} from './sections';

// ─────────────────────────────────────────────────────────────────────────────
// Brief — the inputs a future agent receives (charter success criterion)
// ─────────────────────────────────────────────────────────────────────────────

export const MarketingBriefSchema = z.object({
  businessObjective: z.string().min(1),
  targetAudience: z.enum([
    'artist',
    'fan',
    'agency',
    'label',
    'enterprise-buyer',
    'general',
  ]),
  desiredConversion: z.enum([
    'start',
    'claim-handle',
    'claim-profile',
    'upgrade',
    'request-access',
    'subscribe',
    'book-demo',
    'contact-sales',
    'none',
  ]),
  trafficSource: z
    .enum(['home', 'search', 'social', 'referral', 'direct', 'paid', 'email'])
    .default('direct'),
  intent: z.enum([
    'category',
    'feature',
    'price',
    'compare',
    'launch',
    'informational',
    'blog-index',
    'artist-profile',
  ]),
  availableAssets: z
    .object({
      socialProofVerified: z.boolean().default(false),
      statsVerified: z.boolean().default(false),
      logoCloudVerified: z.boolean().default(false),
      productScreenshots: z.boolean().default(true),
      artistFaces: z.boolean().default(false),
      artistFacesTwoRung: z.boolean().default(false), // aspiration (recognizable) + relatability (peer)
      takeRateReal: z.boolean().default(false),
      phoneProfileAsset: z.boolean().default(false),
      videoAsset: z.boolean().default(false),
    })
    .prefault({}),
  brandConstraints: z
    .object({
      darkOnly: z.literal(true).default(true), // charter delta #9 — always dark
      fullyStatic: z.literal(true).default(true), // .claude/rules/ui.md — always static
      waitlistEnabled: z.boolean().default(false), // gates waitlist recipe + homepage CTAs
    })
    .prefault({}),
});
export type MarketingBrief = z.infer<typeof MarketingBriefSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Composition — the deterministic output tuple (E9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One section in a resolved composition. The tuple is the machine-checkable
 * output: recipeId, sectionId, variantId, CTA positions, proofData flag.
 * Copy/imagery-within-ladder are BOUNDED TASTE (not in the tuple) per D1=B.
 */
export const MarketingCompositionSectionSchema = z.object({
  sectionId: z.enum(
    MARKETING_SECTION_IDS as unknown as [
      MarketingSectionId,
      ...MarketingSectionId[],
    ]
  ),
  variantId: z.string(),
  /** CTA position this section occupies (0 = none; hero carries the first). */
  ctaPosition: z.enum(['primary', 'secondary', 'none']).default('none'),
  /**
   * Proof flag — true iff this section is proof/trust class AND the composition
   * carries verified proof data. False on a proof-class section = the section
   * is ILLEGAL and MUST be omitted (zero-proof path).
   */
  proofVerified: z.boolean().default(false),
  /**
   * Degradation ladder rung selected (1=preferred). Bounded taste only within
   * the chosen rung; the rung itself is deterministic given availableAssets.
   */
  degradationRung: z.number().int().min(1).max(5).default(1),
});
export type MarketingCompositionSection = z.infer<
  typeof MarketingCompositionSectionSchema
>;

export const MarketingCompositionSchema = z.object({
  specVersion: z.string(),
  recipeId: z.enum([
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
  ] as const),
  sections: z.array(MarketingCompositionSectionSchema),
  primaryCtaLabel: z.string(),
  secondaryCtaLabel: z.string().optional(),
  ctaCadence: z.enum([
    'hero-only',
    'hero-and-close',
    'every-2-3-sections-after-proof',
  ]),
  /** Decision trace — human-readable for the AGENT_GUIDE worked example + failure messages. */
  trace: z.array(
    z.object({
      step: z.string(),
      decision: z.string(),
      reason: z.string(),
    })
  ),
});
export type MarketingComposition = z.infer<typeof MarketingCompositionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Decision table — deterministic recipe selection (charter P6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recipe selection is a typed decision table, NOT arbitrary code.
 * Order matters: first match wins. The manifest gate asserts every reachable
 * Brief resolves to exactly one recipe.
 *
 * Predicates are total — every Brief input combination has an entry.
 * The catch-all is `seo` (the safest default for unknown intent).
 */
const RECIPE_DECISION_TABLE: readonly {
  readonly when: (b: MarketingBrief) => boolean;
  readonly recipeId: RecipeId;
  readonly reason: string;
}[] = [
  // 1. Waitlist — gated by brand constraint flag (highest precedence — flips homepage CTAs).
  //    Audience guard (A5 fix): only general/fan audiences use the waitlist recipe;
  //    artist/agency/enterprise-buyer with claim-handle/book-demo/contact-sales win on
  //    their audience-specific rows below even when waitlistEnabled=true.
  {
    when: b =>
      (b.desiredConversion === 'request-access' &&
        (b.targetAudience === 'general' || b.targetAudience === 'fan')) ||
      (b.brandConstraints.waitlistEnabled &&
        b.trafficSource === 'home' &&
        (b.targetAudience === 'general' || b.targetAudience === 'fan')),
    recipeId: 'waitlist',
    reason:
      'waitlist-enabled or request-access conversion (general/fan audience only)',
  },
  // 2. Artist LP — artist audience wins on ANY intent (A7 fix: artist+price → artist-lp
  //    with monetization one-liner, NOT a full pricing table per creator R8; artist+compare
  //    → artist-lp, NOT comparison-page above the fold per creator R9). Artist-audience
  //    precedence is higher than intent-specific rows because the artist arc differs
  //    structurally from the B2B arc.
  {
    when: b =>
      b.targetAudience === 'artist' &&
      (b.intent === 'artist-profile' ||
        b.intent === 'price' ||
        b.intent === 'compare' ||
        b.intent === 'feature' ||
        b.intent === 'category' ||
        b.intent === 'launch' ||
        b.desiredConversion === 'claim-handle' ||
        b.desiredConversion === 'claim-profile'),
    recipeId: 'artist-lp',
    reason:
      'audience=artist wins on any intent (artist arc differs structurally; R8/R9)',
  },
  // 3. Comparison — explicit compare intent (non-artist audiences)
  {
    when: b => b.intent === 'compare',
    recipeId: 'comparison',
    reason: 'intent=compare (non-artist)',
  },
  // 4. Pricing — explicit price intent (non-artist audiences; artist routed to artist-lp above)
  {
    when: b => b.intent === 'price',
    recipeId: 'pricing',
    reason: 'intent=price (non-artist)',
  },
  // 5. Launch — explicit launch intent (non-artist)
  {
    when: b => b.intent === 'launch',
    recipeId: 'launch',
    reason: 'intent=launch (non-artist)',
  },
  // 6. Blog landing — blog-index intent
  {
    when: b => b.intent === 'blog-index',
    recipeId: 'blog-landing',
    reason: 'intent=blog-index',
  },
  // 7. Feature — feature intent (non-artist audiences; artist routed to artist-lp above)
  {
    when: b => b.intent === 'feature',
    recipeId: 'feature',
    reason: 'intent=feature (non-artist)',
  },
  // 8. Agency LP — agency audience (any intent; agency arc is sales-led)
  {
    when: b => b.targetAudience === 'agency',
    recipeId: 'agency-lp',
    reason: 'audience=agency',
  },
  // 9. Enterprise — enterprise-buyer audience
  {
    when: b => b.targetAudience === 'enterprise-buyer',
    recipeId: 'enterprise',
    reason: 'audience=enterprise-buyer',
  },
  // 10. Homepage — home traffic OR general audience + category intent.
  //     NOTE (A6 fix documented): trafficSource='home' here means "this brief targets
  //     the home route," NOT "visitor came from the homepage." The Brief schema documents
  //     this semantic; a future spec version may split routeRole vs trafficSource.
  {
    when: b =>
      b.trafficSource === 'home' ||
      (b.targetAudience === 'general' && b.intent === 'category'),
    recipeId: 'homepage',
    reason: 'traffic=home or general+category',
  },
  // 11. SEO — informational intent OR catch-all (fan audience falls here per J1 —
  //     fan is a documented audience with no recipe yet; served by seo until fan-lp exists)
  {
    when: b => b.intent === 'informational' || b.targetAudience === 'fan',
    recipeId: 'seo',
    reason: 'intent=informational or fan audience (no fan-lp recipe yet)',
  },
  // catch-all
  {
    when: () => true,
    recipeId: 'seo',
    reason: 'catch-all (safest default for unknown intent)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Substitution matching (A4 fix — substitutions were dead code)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a recipe.substitutions[].when predicate against the brief.
 * Predicates mirror the human-readable `when` string but are the canonical
 * machine-checkable form. Returns true iff the substitution should apply.
 *
 * Currently modeled substitutions (extend here when adding new ones):
 *   - artist-lp: feature-split → ownership when competing with DSPs/link-in-bio
 *     (creator R9: ownership REQUIRED as emotional differentiator)
 *   - homepage: social-proof → stats when socialProof absent but stats verified
 *   - homepage: pricing → monetization when audience=artist
 *   - feature: logo-cloud → feature-split when no logos
 *   - seo: content-prose → faq for pure FAQ pages
 */
function matchesSubstitution(
  sub: {
    readonly replace: MarketingSectionId;
    readonly with: MarketingSectionId;
    readonly when: string;
  },
  brief: MarketingBrief,
  recipeId: RecipeId
): boolean {
  // artist-lp: feature-split → ownership when audience=artist and competing with DSPs/link-in-bio.
  // The "competing with DSPs/link-in-bio" condition is encoded as: audience=artist AND
  // intent=artist-profile (the artist LP is the surface that competes with DSPs/link-in-bio).
  // First implementation requires humanOptIn per DX2 (ownership is status: unproven).
  if (sub.replace === 'feature-split' && sub.with === 'ownership') {
    return (
      recipeId === 'artist-lp' &&
      brief.targetAudience === 'artist' &&
      brief.intent === 'artist-profile'
    );
  }
  // homepage: social-proof → stats when socialProof absent but stats verified
  if (sub.replace === 'social-proof' && sub.with === 'stats') {
    return (
      !brief.availableAssets.socialProofVerified &&
      brief.availableAssets.statsVerified
    );
  }
  // homepage: pricing → monetization when audience=artist (one-liner-link, not full table)
  if (sub.replace === 'pricing' && sub.with === 'monetization') {
    return brief.targetAudience === 'artist';
  }
  // feature: logo-cloud → feature-split when no logos (degradation: trust proof = product render)
  if (sub.replace === 'logo-cloud' && sub.with === 'feature-split') {
    return !brief.availableAssets.logoCloudVerified;
  }
  // seo: content-prose → faq for pure FAQ pages (about/support — FaqSection carries the answer)
  if (sub.replace === 'content-prose' && sub.with === 'faq') {
    return recipeId === 'seo' && !brief.availableAssets.productScreenshots;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant selection — deterministic per section (charter P3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Variant selection walks the section's variants in declared order and picks
 * the first whose chooseWhen predicate matches the Brief + section context.
 * This is a TOTAL ORDER per section (no ties) — the manifest gate asserts
 * one defaultVariant and that every reachable Brief resolves to exactly one.
 *
 * A2 fix: when a recipe has the same section id at multiple positions in its
 * sectionOrder (e.g. artist-lp has two feature-split instances — adaptive and
 * reactivation), the arc beat label disambiguates them. selectVariant receives
 * the arc beat for this position (recipe.arc[i].beat) and passes it to
 * matchesVariant so per-instance predicates can fire.
 *
 * Predicates here mirror the chooseWhen summaries in sections.ts but are the
 * executable canonical form. No-match resolves deterministically to the
 * section's defaultVariant (never "agent judgment" — DX3).
 */
function selectVariant(
  sectionId: MarketingSectionId,
  brief: MarketingBrief,
  recipeId: RecipeId,
  arcBeat: string,
  occurrence: number
): { variantId: string; reason: string } {
  const section = getMarketingSection(sectionId);
  // Walk variants in declared order — first match wins. chooseWhen is a
  // human-readable summary in sections.ts; the executable predicate lives here.
  for (const variant of section.variants) {
    if (
      matchesVariant(
        variant.id,
        sectionId,
        brief,
        recipeId,
        arcBeat,
        occurrence
      )
    ) {
      return {
        variantId: variant.id,
        reason: `variant ${variant.id} chosen for section ${sectionId} (beat=${arcBeat}, occurrence=${occurrence}; ${variant.chooseWhen ?? 'default'})`,
      };
    }
  }
  // No-match → defaultVariant (deterministic; never agent judgment — DX3)
  return {
    variantId: section.defaultVariant,
    reason: `no variant match → defaultVariant ${section.defaultVariant} (section ${sectionId}, beat=${arcBeat}, occurrence=${occurrence})`,
  };
}

/**
 * Per-variant executable predicates. Each predicate mirrors the chooseWhen
 * summary in sections.ts but is the canonical machine-checkable form.
 * Predicates form a total order per section (no ties).
 *
 * arcBeat is the recipe's arc[i].beat label for this section instance.
 * occurrence is the 1-based index of this section id within the composition
 * (e.g. the 2nd feature-split in artist-lp has occurrence=2). Used to
 * disambiguate repeated section ids (A2 fix): 1st feature-split = adaptive
 * (screenshot-right), 2nd = reactivation (bordered-screenshot-left per
 * shipped exemplar).
 */
function matchesVariant(
  variantId: string,
  sectionId: MarketingSectionId,
  brief: MarketingBrief,
  recipeId: RecipeId,
  arcBeat: string,
  occurrence: number
): boolean {
  // hero
  if (sectionId === 'hero') {
    if (variantId === 'centered-handle-claim') {
      return (
        brief.targetAudience === 'artist' &&
        brief.desiredConversion === 'claim-handle' &&
        recipeId === 'artist-lp'
      );
    }
    if (variantId === 'centered-phone') {
      return (
        brief.targetAudience === 'artist' &&
        recipeId === 'artist-lp' &&
        brief.availableAssets.phoneProfileAsset
      );
    }
    if (variantId === 'split-screenshot-right') {
      return (
        (brief.targetAudience === 'general' || recipeId === 'homepage') &&
        brief.availableAssets.productScreenshots
      );
    }
    if (variantId === 'centered-video') {
      return recipeId === 'launch' && brief.availableAssets.videoAsset;
    }
    if (variantId === 'centered-none') {
      return (
        recipeId === 'seo' ||
        recipeId === 'blog-landing' ||
        !brief.availableAssets.productScreenshots
      );
    }
  }
  // logo-cloud
  if (sectionId === 'logo-cloud') {
    if (variantId === 'platform-reach-row') {
      return brief.targetAudience === 'artist';
    }
    if (variantId === 'segmented-grid') {
      return (
        brief.targetAudience === 'agency' || brief.targetAudience === 'label'
      );
    }
    if (variantId === 'inline-strip') {
      return brief.availableAssets.logoCloudVerified;
    }
    return false; // logo-cloud omitted if no verified logos (zero-proof) — handled in composition
  }
  // feature-grid
  if (sectionId === 'feature-grid') {
    // No predicate on Brief — variant selection is content-driven at render time
    // (items.length). Composition emits defaultVariant; render-time picks based
    // on items.length. This is the bounded-taste layer (D1=B): variant within
    // a section is structural, but the specific column count is content-driven.
    // For determinism in the tuple, we emit defaultVariant and let the manifest
    // gate assert the render-time variant is one of the legal set.
    return variantId === '3-large'; // default
  }
  // feature-split — A2 fix: occurrence index disambiguates repeated instances.
  //   artist-lp has two feature-split instances: occurrence=1 = adaptive beat
  //   → screenshot-right; occurrence=2 = reactivation beat → bordered-screenshot-left
  //   (per shipped exemplar). The occurrence index is deterministic and matches
  //   the shipped render order (codebase-baseline §2.4: adaptive then reactivation).
  if (sectionId === 'feature-split') {
    if (variantId === 'video-background') {
      return recipeId === 'launch' && brief.availableAssets.videoAsset;
    }
    if (variantId === 'phone-right') {
      return (
        brief.targetAudience === 'artist' &&
        brief.availableAssets.phoneProfileAsset &&
        occurrence === 1 // adaptive instance uses phone-right when phone asset; reactivation uses bordered-screenshot-left
      );
    }
    if (variantId === 'bordered-screenshot-left') {
      // reactivation instance (2nd feature-split in artist-lp) OR launch comparison-adjacent
      return (
        ((recipeId === 'artist-lp' && occurrence === 2) ||
          (recipeId === 'launch' &&
            brief.availableAssets.productScreenshots)) &&
        brief.availableAssets.productScreenshots
      );
    }
    if (variantId === 'screenshot-right') {
      // adaptive instance (1st feature-split in artist-lp) OR homepage/feature default
      return occurrence === 1 && brief.availableAssets.productScreenshots;
    }
    return false;
  }
  // how-it-works
  if (sectionId === 'how-it-works') {
    return variantId === '3-step-strip'; // default; 4-step chosen at render time if steps.length=4
  }
  // social-proof
  if (sectionId === 'social-proof') {
    if (variantId === 'two-rung-aspiration') {
      return (
        brief.targetAudience === 'artist' &&
        brief.availableAssets.artistFacesTwoRung
      );
    }
    if (variantId === 'named-micro-case-study') {
      return (
        brief.targetAudience === 'artist' && brief.availableAssets.takeRateReal
      );
    }
    if (variantId === 'artist-carousel') {
      return (
        brief.targetAudience === 'artist' && brief.availableAssets.artistFaces
      );
    }
    if (variantId === 'case-study-fused') {
      return (
        (recipeId === 'feature' || recipeId === 'homepage') &&
        brief.availableAssets.socialProofVerified
      );
    }
    if (variantId === 'quote-grid') {
      return (
        brief.targetAudience === 'enterprise-buyer' &&
        brief.availableAssets.socialProofVerified
      );
    }
    return false; // omitted if no proof (zero-proof)
  }
  // stats
  if (sectionId === 'stats') {
    if (variantId === 'freshness-counter') {
      return brief.availableAssets.statsVerified; // freshness counter requires live data
    }
    if (variantId === '4-stat-band') {
      return brief.availableAssets.statsVerified;
    }
    if (variantId === '3-stat-band') {
      return brief.availableAssets.statsVerified;
    }
    return false; // omitted if no verified stats (zero-proof)
  }
  // pricing
  if (sectionId === 'pricing') {
    if (variantId === 'decision-assistant') {
      return false; // unproven; requires humanOptIn per DX2
    }
    if (variantId === 'binary-standard-custom') {
      return false; // chosen at render time based on tiers.length
    }
    if (variantId === 'one-liner-link') {
      return brief.targetAudience === 'artist' && recipeId === 'artist-lp';
    }
    if (variantId === 'tier-cards-recommended') {
      return true; // default
    }
    return false;
  }
  // comparison
  if (sectionId === 'comparison') {
    if (variantId === 'side-by-side-split') {
      return (
        recipeId !== 'comparison' && brief.availableAssets.productScreenshots
      );
    }
    if (variantId === 'feature-matrix') {
      return recipeId === 'comparison';
    }
    return false;
  }
  // faq
  if (sectionId === 'faq') {
    if (variantId === 'structured-data-list') {
      return recipeId === 'seo';
    }
    if (variantId === 'objection-handler') {
      return true; // default
    }
    return false;
  }
  // cta
  if (sectionId === 'cta') {
    if (variantId === 'final-dual-path') {
      return (
        brief.targetAudience !== 'artist' &&
        (recipeId === 'pricing' ||
          recipeId === 'enterprise' ||
          recipeId === 'agency-lp' ||
          recipeId === 'comparison')
      );
    }
    if (variantId === 'final-single-claim') {
      return (
        brief.targetAudience === 'artist' ||
        recipeId === 'artist-lp' ||
        recipeId === 'feature'
      );
    }
    if (variantId === 'mid-page-terminal') {
      return false; // cadence-budgeted; only used when ctaCadence = every-2-3-sections-after-proof
    }
    return false;
  }
  // spec-wall
  if (sectionId === 'spec-wall') {
    if (variantId === 'bento') {
      return false; // chosen at render time based on tiles.length and emphasis
    }
    if (variantId === 'dense-compact-grid') {
      return true; // default
    }
    return false;
  }
  // capture
  if (sectionId === 'capture') {
    if (variantId === 'product-demo') {
      return (
        brief.targetAudience === 'artist' &&
        brief.availableAssets.phoneProfileAsset
      );
    }
    if (variantId === 'email-only') {
      return (
        brief.targetAudience === 'general' ||
        recipeId === 'waitlist' ||
        recipeId === 'blog-landing'
      );
    }
    return false;
  }
  // monetization
  if (sectionId === 'monetization') {
    if (variantId === 'earnings-story') {
      return (
        brief.targetAudience === 'artist' && brief.availableAssets.takeRateReal
      );
    }
    if (variantId === 'take-rate-transparency') {
      return (
        brief.targetAudience === 'artist' && brief.availableAssets.takeRateReal
      );
    }
    return false; // omitted if no real take-rate (zero-proof)
  }
  // ownership
  if (sectionId === 'ownership') {
    if (variantId === 'control-block') {
      return brief.targetAudience === 'artist' && recipeId === 'artist-lp';
    }
    return false;
  }
  // content-prose
  if (sectionId === 'content-prose') {
    if (variantId === 'founder-letter') {
      return recipeId === 'launch';
    }
    if (variantId === 'release-notes') {
      return recipeId === 'launch';
    }
    if (variantId === 'article-body') {
      return recipeId === 'seo' || recipeId === 'blog-landing';
    }
    return false;
  }
  // blog-feed
  if (sectionId === 'blog-feed') {
    if (variantId === 'category-filtered-grid') {
      return recipeId === 'blog-landing' && brief.intent === 'blog-index';
    }
    if (variantId === 'featured-grid') {
      return recipeId === 'blog-landing';
    }
    return false;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition resolver — the deterministic algorithm (charter P6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveComposition(brief) → MarketingComposition.
 *
 * The algorithm:
 *   1. Recipe selection: walk RECIPE_DECISION_TABLE; first match wins.
 *   2. Section sequence: take recipe.sectionOrder.
 *   3. Legality filter: drop sections illegal for the audience (audienceLegality).
 *   4. Zero-proof filter: drop proof/trust sections without verified data (zero-proof path).
 *   5. Ordering legality: drop sections whose illegalAfter/requiresPrior are violated.
 *   6. Variant selection: per section, walk variants; first match wins; no-match → defaultVariant.
 *   7. CTA position assignment: hero=primary, cta section=primary (terminal), mid-page after proof=secondary.
 *   8. Trace: record every step for the AGENT_GUIDE worked example + failure messages.
 *
 * Deterministic: same Brief → same Composition, every time (E9 tuple equality).
 * Bounded taste (imagery within degradation rung, copy, density) is NOT in the tuple.
 */
export function resolveComposition(input: unknown): MarketingComposition {
  const brief = MarketingBriefSchema.parse(input);
  const trace: { step: string; decision: string; reason: string }[] = [];

  // 1. Recipe selection
  const recipeMatch = RECIPE_DECISION_TABLE.find(entry => entry.when(brief));
  if (!recipeMatch) {
    throw new Error(
      `resolveComposition: no recipe matched brief (table must be total — file a bug)`
    );
  }
  const recipeId = recipeMatch.recipeId;
  const recipe = getMarketingRecipe(recipeId);
  trace.push({
    step: 'recipe-selection',
    decision: recipeId,
    reason: recipeMatch.reason,
  });

  // 2. Section sequence
  let sections = recipe.sectionOrder.slice();
  trace.push({
    step: 'section-sequence',
    decision: sections.join(','),
    reason: `recipe ${recipeId} sectionOrder`,
  });

  // 2.5. Substitution application (A4 fix — substitutions were dead code).
  //   Walk recipe.substitutions; evaluate the `when` predicate against the
  //   brief; splice replacements into the section list. Predicates are the
  //   executable canonical form here; recipe.substitutions[].when is the
  //   human-readable summary.
  //   IMPORTANT: substitution replaces the FIRST occurrence of `replace` only,
  //   not all occurrences. This preserves repeated-section instances (e.g.
  //   artist-lp has two feature-split instances; substituting the first with
  //   ownership leaves the second feature-split intact for the reactivation beat).
  if (recipe.substitutions) {
    for (const sub of recipe.substitutions) {
      if (matchesSubstitution(sub, brief, recipeId)) {
        const firstIndex = sections.indexOf(sub.replace);
        if (firstIndex >= 0) {
          sections = sections.map((s, i) => (i === firstIndex ? sub.with : s));
          trace.push({
            step: 'substitution',
            decision: `${sub.replace} (first instance) → ${sub.with}`,
            reason: sub.when,
          });
        }
      }
    }
  }

  // 3. Legality filter — audience
  sections = sections.filter(sectionId => {
    const legal = isLegalForAudience(sectionId, brief.targetAudience);
    if (!legal) {
      trace.push({
        step: 'audience-legality-filter',
        decision: `drop ${sectionId}`,
        reason: `section ${sectionId} illegal for audience=${brief.targetAudience}`,
      });
    }
    return legal;
  });

  // 4. Zero-proof filter — drop proof/trust sections without verified data
  sections = sections.filter(sectionId => {
    if (!isProofClass(sectionId)) return true;
    const hasVerified =
      (sectionId === 'social-proof' &&
        brief.availableAssets.socialProofVerified) ||
      (sectionId === 'stats' && brief.availableAssets.statsVerified) ||
      (sectionId === 'logo-cloud' && brief.availableAssets.logoCloudVerified);
    if (!hasVerified) {
      trace.push({
        step: 'zero-proof-filter',
        decision: `drop ${sectionId}`,
        reason: `proof/trust class without verified data — zero-proof path (charter design law #9)`,
      });
    }
    return hasVerified;
  });

  // 5. Ordering legality — illegalAfter + requiresPrior.
  //   illegalAfter semantics: "cannot IMMEDIATELY follow" — the section cannot
  //   be placed directly after any of its illegalAfter entries (e.g. social-proof
  //   illegalAfter: ['hero'] means social-proof cannot be the very next section
  //   after hero; it CAN appear later). This is the B2B C4 reading: "proof is a
  //   gradient, not a top beat" — proof cannot IMMEDIATELY follow hero, but it
  //   can appear after a feature beat.
  //   requiresPrior semantics: "every listed section must appear somewhere
  //   earlier in the page" (provenance precondition — e.g. pricing requiresPrior
  //   ['hero', 'feature-grid'] means both must appear before pricing, not
  //   necessarily immediately before).
  const priorSections: MarketingSectionId[] = [];
  let immediatelyPreceding: MarketingSectionId | null = null;
  sections = sections.filter(sectionId => {
    const section = getMarketingSection(sectionId);
    // illegalAfter: this section cannot IMMEDIATELY follow any of its illegalAfter entries
    const illegalAfterViolation =
      immediatelyPreceding !== null &&
      section.illegalAfter?.includes(immediatelyPreceding);
    if (illegalAfterViolation) {
      trace.push({
        step: 'illegalAfter-filter',
        decision: `drop ${sectionId}`,
        reason: `section ${sectionId} illegalAfter ${section.illegalAfter?.join(',')} and immediately-preceding=${immediatelyPreceding}`,
      });
      immediatelyPreceding = sectionId; // the dropped section is still "immediately preceding" for the next
      return false;
    }
    // requiresPrior: every required section must be in priorSections (anywhere earlier)
    const requiresPriorMet = hasRequiredPrior(sectionId, priorSections);
    if (!requiresPriorMet) {
      trace.push({
        step: 'requiresPrior-filter',
        decision: `drop ${sectionId}`,
        reason: `section ${sectionId} requiresPrior ${(section.requiresPrior ?? []).join(',')} not yet present`,
      });
      immediatelyPreceding = sectionId;
      return false;
    }
    priorSections.push(sectionId);
    immediatelyPreceding = sectionId;
    return true;
  });

  // 5.5. Post-filter arc validation (A3 fix — arc holes were silent).
  //   Walk recipe.arc; for each beat whose `section` is non-null, assert the
  //   section survived the filter pipeline OR has a declared fallback. Arc
  //   holes without a fallback = the composition is structurally broken; emit
  //   a trace warning. The manifest gate asserts every recipe's arc beats
  //   either survive the worst-case zero-proof filter or have a fallback.
  for (const beat of recipe.arc) {
    if (beat.section === null) continue;
    if (sections.includes(beat.section)) continue;
    const fallback = recipe.fallbacks?.find(f =>
      f.missing.includes(beat.section ?? '')
    );
    if (fallback) {
      trace.push({
        step: 'arc-hole-fallback',
        decision: `beat ${beat.beat} (section ${beat.section}) omitted`,
        reason: `fallback: ${fallback.fallback}`,
      });
    } else {
      trace.push({
        step: 'arc-hole-warning',
        decision: `beat ${beat.beat} (section ${beat.section}) omitted with NO fallback`,
        reason: `arc integrity violation — recipe ${recipeId} needs a fallback for ${beat.section} (add to recipe.fallbacks)`,
      });
    }
  }

  // 6. Variant selection + 7. CTA position assignment.
  //   A2 fix: pass the arc beat label + per-section occurrence index for this
  //   position so per-instance predicates can disambiguate repeated section ids
  //   (e.g. feature-split in artist-lp: 1st instance = adaptive, 2nd = reactivation).
  //   Occurrence is computed against the ORIGINAL sectionOrder (pre-substitution)
  //   so a substituted-away first instance still counts — the reactivation
  //   feature-split keeps occurrence=2 even after the adaptive one becomes ownership.
  const originalOccurrences: Partial<Record<MarketingSectionId, number>> = {};
  const originalOccurrenceByPosition: number[] = recipe.sectionOrder.map(s => {
    const occ = (originalOccurrences[s] ?? 0) + 1;
    originalOccurrences[s] = occ;
    return occ;
  });
  // Map original positions to filtered positions (sections may have been dropped)
  const filteredPositionToOriginal = new Map<number, number>();
  let filteredIdx = 0;
  for (let origIdx = 0; origIdx < recipe.sectionOrder.length; origIdx++) {
    const origSection = recipe.sectionOrder[origIdx];
    // Skip if this original position was substituted away OR dropped by a filter
    // (the sections array is post-filter; we walk it in parallel)
    if (filteredIdx < sections.length) {
      // Check if the filtered section at filteredIdx corresponds to origIdx.
      // After substitution, sections[filteredIdx] may be ownership (was feature-split).
      // We match by: the original section at origIdx is either the same id OR
      // was substituted to the current filtered id.
      const filteredSection = sections[filteredIdx];
      const wasSubstituted = recipe.substitutions?.some(
        sub => sub.replace === origSection && sub.with === filteredSection
      );
      if (origSection === filteredSection || wasSubstituted) {
        filteredPositionToOriginal.set(filteredIdx, origIdx);
        filteredIdx++;
      }
    }
  }
  const compositionSections: MarketingCompositionSection[] = sections.map(
    (sectionId, index) => {
      const origIdx = filteredPositionToOriginal.get(index) ?? index;
      const arcBeat = recipe.arc[origIdx]?.beat ?? `position-${origIdx}`;
      const occurrence = originalOccurrenceByPosition[origIdx] ?? 1;
      const { variantId, reason } = selectVariant(
        sectionId,
        brief,
        recipeId,
        arcBeat,
        occurrence
      );
      trace.push({
        step: 'variant-selection',
        decision: `${sectionId}/${variantId}`,
        reason,
      });
      const proofVerified =
        isProofClass(sectionId) &&
        ((sectionId === 'social-proof' &&
          brief.availableAssets.socialProofVerified) ||
          (sectionId === 'stats' && brief.availableAssets.statsVerified) ||
          (sectionId === 'logo-cloud' &&
            brief.availableAssets.logoCloudVerified));
      // CTA position: hero=primary (first), cta section=primary (terminal), others=none
      let ctaPosition: 'primary' | 'secondary' | 'none' = 'none';
      if (index === 0) {
        ctaPosition = 'primary'; // hero carries the first primary CTA
      } else if (sectionId === 'cta') {
        ctaPosition = 'primary'; // final CTA section is the closing primary
      } else if (sectionId === 'capture') {
        ctaPosition = 'primary'; // capture is a conversion section (waitlist/blog-landing)
      }
      return {
        sectionId,
        variantId,
        ctaPosition,
        proofVerified,
        degradationRung: pickDegradationRung(sectionId, brief),
      };
    }
  );

  // 8. CTA label + cadence from recipe
  return {
    specVersion: MARKETING_SPEC_VERSION,
    recipeId,
    sections: compositionSections,
    primaryCtaLabel: recipe.ctaCadence.primaryLabel,
    secondaryCtaLabel: recipe.ctaCadence.secondaryLabel,
    ctaCadence: recipe.ctaCadence.cadence,
    trace,
  };
}

/**
 * Pick the degradation ladder rung deterministically given availableAssets.
 * Rung 1 = preferred; higher = more degraded. Bounded taste only WITHIN the
 * chosen rung (e.g. which specific screenshot scenario id — that's render-time).
 */
function pickDegradationRung(
  sectionId: MarketingSectionId,
  brief: MarketingBrief
): number {
  // product-screenshot asset class (hero media, feature-split media, spec-wall tiles)
  if (
    sectionId === 'hero' ||
    sectionId === 'feature-split' ||
    sectionId === 'spec-wall'
  ) {
    if (brief.availableAssets.phoneProfileAsset) return 1;
    if (brief.availableAssets.productScreenshots) return 1;
    return 3; // OMIT visual (degradation ladder tier 3)
  }
  // artist-face asset class (social-proof)
  if (sectionId === 'social-proof') {
    if (brief.availableAssets.artistFacesTwoRung) return 1;
    if (brief.availableAssets.artistFaces) return 2; // peer-tier only or recognizable-only
    return 4; // OMIT (zero-proof)
  }
  // proof-data asset class (stats, monetization case-study)
  if (sectionId === 'stats' || sectionId === 'monetization') {
    if (
      brief.availableAssets.statsVerified ||
      brief.availableAssets.takeRateReal
    )
      return 1;
    return 5; // OMIT (zero-proof)
  }
  // logo asset class
  if (sectionId === 'logo-cloud') {
    if (brief.availableAssets.logoCloudVerified) return 1;
    return 3; // OMIT (zero-proof)
  }
  return 1; // non-asset sections default to rung 1
}

// Import the spec version from the barrel (avoids a circular import via index.ts)
// We re-declare it here as the source of truth; index.ts re-exports.
export const MARKETING_SPEC_VERSION = '1.0.0';
