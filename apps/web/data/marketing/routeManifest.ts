/**
 * Marketing Route Manifest — binds every Jovie marketing route to a recipeId
 * (or marks it exempt with a sanctioned reason). Owns the exemption ratchet
 * (DX2 escape hatch) + per-route lifecycle.
 *
 * The manifest gate (apps/web/tests/unit/marketing/recipe-manifest.test.ts)
 * asserts bidirectionally: route-glob ⇔ manifest; recipeId ∈ registry;
 * proven recipes reference a real route; exemption ratchet is decrease-only;
 * section ids ∈ section registry; anchor parity docs⇔registry.
 *
 * Per codebase-baseline §1: the live homepage lives at (home)/page.tsx NOT
 * app/(marketing)/ — manifest must include (home). Also app/waitlist/* lives
 * outside (marketing) entirely — manifest must include those public waitlist
 * surfaces or sanction an exemption.
 */

import { isRenderFixturePathname } from '@/lib/render-fixture-policy';
import type { ProposedSectionId } from './designGaps';
import type { RecipeId } from './recipes';
import { getMarketingRecipe } from './recipes';
import type { MarketingSectionId } from './sections';
import { getMarketingSection } from './sections';

export type RenderedSectionBinding =
  | {
      readonly kind: 'approved-section';
      readonly sectionId: MarketingSectionId;
      readonly componentPath: string;
      readonly variantId?: string;
      /** Stable identity for otherwise equal repeated production beats. */
      readonly occurrenceId?: string;
    }
  | {
      readonly kind: 'proposal';
      readonly proposalId: ProposedSectionId;
    };

const approvedBinding = (
  componentPath: string,
  sectionId: MarketingSectionId,
  variantId?: string,
  occurrenceId?: string
): RenderedSectionBinding => {
  const section = getMarketingSection(sectionId);
  if (section.status !== 'approved') {
    throw new Error(
      `Route manifest cannot bind non-approved section ${sectionId}`
    );
  }
  if (variantId) {
    const variant = section.variants.find(
      candidate => candidate.id === variantId
    );
    if (variant?.status !== 'active') {
      throw new Error(
        `Route manifest cannot bind non-active variant ${sectionId}/${variantId}`
      );
    }
  }
  return {
    kind: 'approved-section' as const,
    sectionId,
    componentPath,
    ...(variantId ? { variantId } : {}),
    ...(occurrenceId ? { occurrenceId } : {}),
  };
};

const approvedBindings = (
  componentPath: string,
  ...sectionIds: readonly MarketingSectionId[]
): readonly RenderedSectionBinding[] =>
  sectionIds.map(sectionId => approvedBinding(componentPath, sectionId));

const approvedVariantBinding = (
  componentPath: string,
  sectionId: MarketingSectionId,
  variantId: string,
  occurrenceId?: string
): RenderedSectionBinding =>
  approvedBinding(componentPath, sectionId, variantId, occurrenceId);

/**
 * Product evidence kind (JOV-6917, invariant `product-page-shows-product`):
 * the canonical product UI a product route must render.
 * - `framed-screenshot`: a captured product frame (e.g. ProductScreenshotFrame
 *   or an approved screenshot-registry image in a device/frame treatment).
 * - `interactive-mockup`: the real interactive product primitive mounted on
 *   the page (claim form, smart-link dial, merch design carousel, paste form,
 *   demo visual, notification cards).
 * - `annotated-callout`: an annotated callout from the callout family.
 */
export type ProductEvidenceKind =
  | 'framed-screenshot'
  | 'interactive-mockup'
  | 'annotated-callout';

export interface ProductEvidenceDeclaration {
  readonly kind: ProductEvidenceKind;
  /**
   * Source file that renders the evidence (the landing component or the
   * evidence component itself). Must exist on disk.
   */
  readonly componentPath: string;
  /**
   * `data-testid` the rendered page must expose inside the hero section
   * (desktop above-the-fold) or the first two top-level sections (mobile).
   */
  readonly testId: string;
}

/**
 * Recipes whose routes are product pages: they exist to demonstrate a real
 * product capability, so every bound route must declare and render product
 * evidence. Enforced by tests/unit/marketing/product-evidence-contract.
 */
export const PRODUCT_ROUTE_RECIPES: readonly RecipeId[] = [
  'artist-lp',
  'feature',
];

/**
 * Whether a manifest entry is a product route that must render product
 * evidence. Aliases are included — they serve the same product surface.
 */
export function isProductRouteEntry(
  entry: Pick<RouteManifestEntry, 'recipeId' | 'status' | 'exempt'>
): boolean {
  return (
    entry.status === 'active' &&
    !entry.exempt &&
    entry.recipeId !== undefined &&
    PRODUCT_ROUTE_RECIPES.includes(entry.recipeId)
  );
}

/**
 * Declaration gate: returns a problem string when a product route declares
 * no product evidence or an invalid one; null when the declaration is
 * well-formed. Rendered-DOM enforcement lives in the contract test.
 */
export function productEvidenceDeclarationIssue(
  entry: Pick<RouteManifestEntry, 'glob' | 'productEvidence'>
): string | null {
  const evidence = entry.productEvidence;
  if (!evidence) {
    return `${entry.glob} is a product route with no productEvidence declaration`;
  }
  if (!evidence.componentPath.trim()) {
    return `${entry.glob} productEvidence.componentPath is empty`;
  }
  if (!evidence.testId.trim()) {
    return `${entry.glob} productEvidence.testId is empty`;
  }
  return null;
}

/** A route entry — either bound to a recipe or exempt with a sanctioned reason. */
export interface RouteManifestEntry {
  /** Route glob relative to apps/web/app/ (e.g. '(marketing)/about/page.tsx', '(home)/page.tsx'). */
  readonly glob: string;
  /** Recipe this route implements — required unless `exempt`. */
  readonly recipeId?: RecipeId;
  /** Ordered production bindings. Repeated section ids are legal recipe beats. */
  readonly renderedSections: readonly RenderedSectionBinding[];
  /**
   * Evidence that `renderedSections` matches the mounted source. `verified`
   * certifies section bindings only — NOT design-invariant compliance. A
   * verified route can still carry invariant debt; that lives in
   * tests/unit/marketing/marketing-route-source-invariants.baseline.json
   * (source) and tests/product-screenshots/route-dom-marketing-baseline.json
   * (rendered DOM), both decrease-only.
   */
  readonly bindingEvidence: {
    readonly status: 'verified' | 'unverified' | 'exempt';
    readonly source: string;
    readonly notes?: string;
  };
  /**
   * Exemption — when present, the route is NOT a recipe-composable page.
   * DX2 escape hatch: requires Linear ID + approvedBy + prUrl + optional expires.
   * The exemption ratchet (decrease-only baseline JSON) applies to legacy/
   * unapproved exemptions only; sanctioned exemptions with these fields are
   * ratchet-exempt (the count of unsanctioned exemptions must not increase).
   */
  readonly exempt?: {
    readonly reason: string;
    readonly linearId: string; // JOV-XXXX — mandatory per no-orphan rule
    readonly approvedBy: string;
    readonly prUrl: string;
    readonly expires?: string; // ISO date; optional
  };
  /** Per-route lifecycle — status of this binding, not the recipe. */
  readonly status: 'active' | 'deprecated' | 'removed';
  readonly specVersion: string; // MARKETING_SPEC_VERSION at binding time
  /** Canonical URL the route serves (for cross-reference). */
  readonly url: string;
  /**
   * Concrete public path used by the pre-migration render gate. Exact routes
   * default to `url`; wildcard routes and intentional legacy redirects must
   * declare a fixture explicitly so CI never tests an unresolved glob.
   */
  readonly healthCheck?: {
    readonly path: string;
    readonly expected: 'page' | 'redirect' | 'not-found';
    readonly waitFor?: string;
    /** Explicit fallback roots: census must verify identity and hidden state. */
    readonly runtimeFallbacks?: readonly {
      readonly selector: string;
      readonly componentPath: string;
      readonly hiddenWhen: 'scripting-enabled';
    }[];
    readonly allowedFinalPaths?: readonly string[];
    readonly allowsAuthShell?: boolean;
    readonly requiresSharedChrome?: boolean;
  };
  /**
   * Product evidence (JOV-6917): the canonical product-evidence component
   * this route must render. Required on product routes
   * (`isProductRouteEntry`); the product-evidence contract test renders the
   * page and fails when the declared `testId` is absent from the hero or the
   * first two top-level sections.
   */
  readonly productEvidence?: ProductEvidenceDeclaration;
  /** noindex flag — true if the route is noindex today (e.g. /ai, /demo/video). */
  readonly noindex?: boolean;
  /** Alias-of — when this route is an alias of another (e.g. /artist-profile → /artist-profiles). */
  readonly aliasOf?: string;
  /**
   * humanOptIn — required iff the route's resolved composition uses any
   * `status: 'unproven'` variant or `requires-human-opt-in` section (DX2 escape
   * hatch). The PR URL is the approval artifact (post-2026-07-06 autonomy
   * doctrine — approval artifact = PR/Linear, not a pre-merge human).
   */
  readonly humanOptIn?: {
    readonly prUrl: string;
    readonly date: string; // ISO date
  };
}

/**
 * The route manifest. Per JOV-5650 — every recursive page.tsx under
 * (marketing), (home), waitlist, and the guarded profile-admission route is
 * represented exactly once. Dynamic engineering article routes are explicit
 * exemptions rather than being hidden behind their index-route entries. This
 * array is the current source authority; generated ledgers and capture catalogs
 * derive their counts instead of copying a prose inventory that can drift.
 *
 * Exemptions are sanctioned (carry linearId + approvedBy + prUrl) per DX2.
 * The baseline exemption count for the ratchet = current sanctioned count.
 */
export const MARKETING_ROUTE_MANIFEST: readonly RouteManifestEntry[] = [
  // ── Proven recipes ────────────────────────────────────────────────────────
  {
    glob: '(home)/page.tsx',
    recipeId: 'homepage',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/homepage/HomepageIdentityHero.tsx',
        'hero',
        'split-claim-card'
      ),
      // The unsupported adoption strip is intentionally omitted until it has
      // an attributable permission or adoption receipt.
      approvedVariantBinding(
        'apps/web/components/homepage/HomepageIdentitySections.tsx',
        'feature-split',
        'editorial',
        'presence'
      ),
      approvedVariantBinding(
        'apps/web/components/homepage/HomepageIdentitySections.tsx',
        'feature-split',
        'editorial',
        'structure'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/FaqSection.tsx',
        'faq',
        'structured-data-list'
      ),
      approvedBinding(
        'apps/web/components/homepage/HomepageIdentityClose.tsx',
        'cta',
        'editorial-search'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source:
        'JOV-6220 source owner reconciliation 2026-09-29; JOV-7795 homepage anatomy contract; HomepageIdentityHero and HomepageIdentitySections render tests',
      notes:
        'Identity v3 supersedes the legacy relationships/changelog composition (Tim 2026-09-28). Source inventory only; exact deployed mounted-section, visual, and outcome receipts remain separate. Pen identity is unknown.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/',
    healthCheck: {
      path: '/',
      expected: 'page',
      waitFor: '[data-testid="marketing-section-hero"]',
    },
  },
  {
    glob: '(marketing)/new/page.tsx',
    recipeId: 'homepage',
    renderedSections: [],
    bindingEvidence: {
      status: 'unverified',
      source: 'https://github.com/JovieInc/Jovie/pull/20188',
      notes:
        'Retired homepage-v2 alias redirects to /. It renders no recipe sections; homepage evidence belongs to the live / route.',
    },
    status: 'deprecated',
    specVersion: '1.2.0',
    url: '/new',
    aliasOf: '/',
    noindex: true,
    healthCheck: {
      path: '/new',
      expected: 'redirect',
      allowedFinalPaths: ['/'],
    },
  },
  {
    glob: '(marketing)/pricing/page.tsx',
    recipeId: 'pricing',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/organisms/PricingRecipeBody.tsx',
        'hero',
        'centered-none'
      ),
      approvedVariantBinding(
        'apps/web/components/organisms/PricingRecipeBody.tsx',
        'pricing',
        'tier-cards-neutral'
      ),
      approvedVariantBinding(
        'apps/web/components/organisms/PricingRecipeBody.tsx',
        'comparison',
        'feature-matrix'
      ),
      approvedVariantBinding(
        'apps/web/components/organisms/PricingRecipeBody.tsx',
        'cta',
        'plan-actions'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/changelog/ChangelogEmailSignup.tsx',
        'capture',
        'email-only',
        'product-updates'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source: 'JOV-6220 source and live section census 2026-09-29',
      notes:
        'No social proof or FAQ is rendered. Shared product-update opt-in is included. Source identity only; native comparison visual owner, deployed strict validation, and outcomes remain separate.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/pricing',
  },
  {
    glob: '(marketing)/artist-profiles/page.tsx',
    recipeId: 'artist-lp',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/marketing/MarketingPosterHero.tsx',
        'hero',
        'centered-phone'
      ),
      // logo-cloud renders only once a brand grants permission for this page
      // (data/product-truth/logo-permissions.ts, JOV-7795).
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileAdaptiveSection.tsx',
        'feature-split',
        'phone-right',
        'adaptive'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileOutcomesCarousel.tsx',
        'feature-grid',
        '4-ledger'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileCaptureSection.tsx',
        'capture',
        'product-demo',
        'fan-capture'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx',
        'feature-split',
        'phone-right',
        'opinionated'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileLandingPage.tsx',
        'feature-split',
        'phone-left',
        'annotated-truth'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/MarketingShippedSitesShowcase.tsx',
        'product-gallery',
        'profile-grid',
        'product-examples'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/MarketingPlatformSpecBento.tsx',
        'spec-wall',
        '5-screenshot-bento'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileHowItWorks.tsx',
        'how-it-works',
        'split-setup'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/artist-profile/ArtistProfileSocialProof.tsx',
        'product-gallery',
        'release-rail',
        'release-cycle'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/FaqSection.tsx',
        'faq',
        'objection-handler'
      ),
      approvedVariantBinding(
        'apps/web/components/site/MarketingTerminalCta.tsx',
        'cta',
        'final-single-claim'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/changelog/ChangelogEmailSignup.tsx',
        'capture',
        'email-only',
        'product-updates'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source: 'JOV-6220 actual source owner and section census 2026-09-29',
      notes:
        'Source inventory includes every page beat and the shared opt-in. Demo galleries are product examples, not customer adoption. Native design, deployed checks, and real outcomes require separate receipts.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-profiles',
    productEvidence: {
      kind: 'framed-screenshot',
      componentPath:
        'apps/web/components/marketing/artist-profile/ArtistProfileHero.tsx',
      testId: 'artist-profile-hero-product',
    },
  },
  {
    glob: '(marketing)/artist-profile/page.tsx',
    recipeId: 'artist-lp',
    renderedSections: approvedBindings(
      'components/marketing/artist-profile/ArtistProfileLandingRoute.tsx',
      'hero',
      'feature-split',
      'feature-grid',
      'capture',
      'comparison',
      'spec-wall',
      'how-it-works',
      'feature-grid',
      'faq',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'JOV-7607 navigation audit 2026-10-03',
      notes:
        'The singular alias permanently redirects to /artist-profiles before this fallback page renders.',
    },
    status: 'deprecated',
    specVersion: '1.0.0',
    url: '/artist-profile',
    healthCheck: {
      path: '/artist-profile',
      expected: 'redirect',
      allowedFinalPaths: ['/artist-profiles'],
      requiresSharedChrome: false,
    },
    productEvidence: {
      kind: 'framed-screenshot',
      componentPath:
        'apps/web/components/marketing/artist-profile/ArtistProfileHero.tsx',
      testId: 'artist-profile-hero-product',
    },
    aliasOf: '/artist-profiles',
  },
  {
    glob: '(marketing)/solutions/[audience]/page.tsx',
    recipeId: 'artist-lp',
    renderedSections: approvedBindings(
      'components/marketing/artist-profile/ArtistProfileLandingRoute.tsx',
      'hero',
      'feature-split',
      'feature-grid',
      'capture',
      'comparison',
      'spec-wall',
      'how-it-works',
      'feature-grid',
      'faq',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source:
        'route audit 2026-09-26 (JOV-5861); page record 2026-09-30 (JOV-7275)',
      notes:
        'Family renderer for content/pages/solutions records. The artists record composes the same artist-lp sections as /artist-profiles (zero pixel diff at 390 and 1440). /artists remains the directory. Release-cycle gallery is product evidence, not social proof.',
    },
    status: 'active',
    specVersion: '1.5.0',
    url: '/solutions/*',
    healthCheck: {
      path: '/solutions/artists',
      expected: 'page',
    },
    productEvidence: {
      kind: 'framed-screenshot',
      componentPath:
        'apps/web/components/marketing/artist-profile/ArtistProfileHero.tsx',
      testId: 'artist-profile-hero-product',
    },
  },
  {
    glob: '(marketing)/artist-notifications/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'components/marketing/artist-notifications/ArtistNotificationsLanding.tsx',
      'hero',
      'capture',
      'feature-split',
      'feature-grid',
      'spec-wall',
      'faq',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-notifications',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath:
        'apps/web/components/marketing/artist-notifications/ArtistNotificationsHero.tsx',
      testId: 'artist-notifications-card-stage',
    },
  },
  {
    glob: '(marketing)/download/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/download/page.tsx',
      'hero',
      'feature-grid',
      'how-it-works',
      'feature-grid',
      'faq',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/download',
    productEvidence: {
      kind: 'framed-screenshot',
      componentPath: 'apps/web/app/(marketing)/download/page.tsx',
      testId: 'download-desktop-screenshot',
    },
  },
  {
    glob: '(marketing)/pay/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/components/features/pay/PayLanding.tsx',
      'hero',
      'how-it-works',
      'feature-grid',
      'feature-grid',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'source binding audit 2026-09-01',
      notes:
        'PayLanding uses MarketingHero, two feature-card sections, a use-case feature grid, and a terminal claim form. This records source reality without asserting full feature-recipe parity.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/pay',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath:
        'apps/web/components/features/home/claim-handle/ClaimHandleForm.tsx',
      testId: 'claim-handle-form',
    },
    healthCheck: {
      path: '/pay',
      expected: 'page',
      waitFor: '[data-testid="pay-hero"]',
    },
  },
  {
    glob: '(marketing)/voice/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/voice/page.tsx',
      'hero',
      'feature-grid',
      'feature-split',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/voice',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath: 'apps/web/components/features/landing/VoiceDemoVisual.tsx',
      testId: 'voice-demo-visual',
    },
    noindex: true,
  },
  {
    glob: '(marketing)/instant-merch/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/instant-merch/InstantMerchLanding.tsx',
      'hero',
      'feature-grid',
      'how-it-works',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-08-01',
      notes:
        'Hero mounts the real chat merch review surface (ChatMerchDesignCarousel) with Tim White dogfood concepts whose previews are garment mockups rendered by the canonical merch pipeline (scripts/generate-instant-merch-proof.ts); selection hands off into the authenticated merch conversation.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/instant-merch',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath:
        'apps/web/app/(marketing)/instant-merch/InstantMerchLanding.tsx',
      testId: 'chat-merch-option-card',
    },
  },
  {
    glob: '(marketing)/youtube-thumbnails/page.tsx',
    recipeId: 'feature',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/marketing/MarketingHero.tsx',
        'hero',
        'left-none'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.tsx',
        'how-it-works',
        '3-step-strip'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.tsx',
        'feature-grid',
        'two-column-text'
      ),
      approvedBinding(
        'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.tsx',
        'cta',
        'included-single'
      ),
    ],
    bindingEvidence: {
      status: 'unverified',
      source: 'route implementation #17076 (JOV-5862); pinned 12b203f9',
      notes:
        'Current left/no-media hero, two-column title/body safeguards, and inline CTA are intentional source output. Hero/grid source variants are explicit; inline CTA has a source-only canonical root and included-single body binding; exact mounted validation remains pending and Pen identity is explicitly unknown. No render or visual admission.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/youtube-thumbnails',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath:
        'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailPasteForm.tsx',
      testId: 'youtube-thumbnails-paste-form',
    },
  },
  {
    glob: '(marketing)/product/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/product/ProductLanding.tsx',
      'hero'
    ),
    bindingEvidence: {
      status: 'unverified',
      source: 'Tim DESIGN_READY ship 2026-09-17 /product hero + claim card',
      notes:
        'PRODUCT / Your living identity on the internet. hero with jov.ie/you claim-card proof (headline swapped with the homepage 2026-09-28). Live marketing page — index and sitemap; do not 410 or treat as a reserved-gone username. Source-only; Pen identity is explicitly unknown. No render or visual admission.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/product',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath: 'apps/web/app/(marketing)/product/ProductLanding.tsx',
      testId: 'product-claim-card',
    },
    healthCheck: {
      path: '/product',
      expected: 'page',
      waitFor: '[data-testid="marketing-section-hero"]',
    },
  },
  {
    glob: '(marketing)/card/page.tsx',
    recipeId: 'feature',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/marketing/MarketingHero.tsx',
        'hero',
        'split-screenshot-right'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
        'how-it-works',
        '3-step-strip'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
        'feature-grid',
        'two-column-text'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
        'faq',
        'objection-handler'
      ),
      approvedVariantBinding(
        'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
        'cta',
        'final-single-claim'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source:
        'JOV-6237 source implementation and route-health contract 2026-09-19',
      notes:
        'Coming-soon feature page using canonical marketing sections, an explicitly illustrative card preview, and the approved public-profile screenshot registry. Exact mounted identities are exercised by marketing-route-health.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/card',
    productEvidence: {
      kind: 'framed-screenshot',
      componentPath: 'apps/web/components/marketing/ProductScreenshotFrame.tsx',
      testId: 'product-screenshot-frame-public-profile-mobile',
    },
    healthCheck: {
      path: '/card',
      expected: 'page',
      waitFor: '[data-testid="marketing-section-hero"]',
    },
  },
  {
    glob: '(marketing)/smart-links/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/smart-links/SmartLinksLanding.tsx',
      'hero',
      'how-it-works',
      'feature-split',
      'cta'
    ),
    bindingEvidence: {
      status: 'unverified',
      source: 'JOV-6560 source and canonical Pen draft',
      notes:
        'Interactive two-release dial is source-backed; mounted render and native save proof are pending.',
    },
    status: 'active',
    specVersion: '1.4.0',
    url: '/smart-links',
    productEvidence: {
      kind: 'interactive-mockup',
      componentPath: 'apps/web/app/(marketing)/smart-links/SmartLinksDemo.tsx',
      testId: 'smart-links-demo',
    },
  },
  {
    glob: '(marketing)/launch/page.tsx',
    recipeId: 'launch',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/launch/page.tsx',
      'hero',
      'logo-cloud',
      'feature-split',
      'feature-split',
      'feature-split',
      'feature-split',
      'feature-split',
      'feature-split',
      'content-prose',
      'comparison',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/launch',
  },
  {
    glob: '(marketing)/about/page.tsx',
    recipeId: 'seo',
    renderedSections: approvedBindings(
      'apps/web/components/organisms/AboutPageContent.tsx',
      'hero',
      'content-prose',
      'content-prose',
      'faq'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/about',
  },
  {
    glob: '(marketing)/support/page.tsx',
    recipeId: 'seo',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/support/page.tsx',
      'hero',
      'content-prose',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'source binding audit 2026-09-26',
      notes:
        'SupportPageContent renders MarketingHero, SupportChannels as the prose/help body pointing at the canonical Help Center on docs.jov.ie, and SupportCta in that order. FAQs rehomed to the canonical troubleshooting article under JOV-5897, so the seo recipe faq beat intentionally no longer applies.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/support',
    healthCheck: {
      path: '/support',
      expected: 'page',
      waitFor: '[data-testid="support-hero"]',
    },
  },
  {
    glob: '(marketing)/developers/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5412 public developer guide',
      notes:
        'Public API documentation page uses the marketing shell but is prose-led rather than recipe-composable.',
    },
    exempt: {
      reason:
        'public developer documentation page — prose API reference; not recipe-composable',
      linearId: 'JOV-5412',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16619',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/developers',
    healthCheck: {
      path: '/developers',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/api-versioning/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5650 route manifest sweep',
      notes:
        'Public API lifecycle policy uses marketing primitives but is prose documentation rather than a recipe-composable page.',
    },
    exempt: {
      reason:
        'public API policy documentation page - prose lifecycle reference; not recipe-composable',
      linearId: 'JOV-5650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16742',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/api-versioning',
    healthCheck: {
      path: '/api-versioning',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/cli/page.tsx',
    recipeId: 'seo',
    renderedSections: [
      approvedVariantBinding(
        'apps/web/components/marketing/CliLandingPage.tsx',
        'hero',
        'centered-none'
      ),
      ...approvedBindings(
        'apps/web/components/marketing/CliLandingPage.tsx',
        'content-prose'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/CliLandingPage.tsx',
        'faq',
        'structured-data-list'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/CliLandingPage.tsx',
        'cta',
        'final-single-claim'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source: 'JOV-5472 CLI landing page',
      notes:
        'Canonical /cli uses MarketingHero centered-none, prose command docs, FAQPage schema, and MarketingFooterCta. content-prose has no active variant.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/cli',
    healthCheck: {
      path: '/cli',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/compare/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-1650 compare hub',
      notes:
        'Hub index listing comparison slugs. Uses the marketing shell but is a prose index rather than a recipe-composable page.',
    },
    exempt: {
      reason:
        'compare hub index listing comparison slugs; not recipe-composable',
      linearId: 'JOV-1650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/17985',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/compare',
    healthCheck: {
      path: '/compare',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/alternatives/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-1650 alternatives hub',
      notes:
        'Hub index listing alternative slugs. Uses the marketing shell but is a prose index rather than a recipe-composable page.',
    },
    exempt: {
      reason:
        'alternatives hub index listing alternative slugs; not recipe-composable',
      linearId: 'JOV-1650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/17985',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/alternatives',
    healthCheck: {
      path: '/alternatives',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/compare/[slug]/page.tsx',
    recipeId: 'comparison',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/compare/[slug]/page.tsx',
      'hero',
      'comparison',
      'cta',
      'faq'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/compare/*',
    healthCheck: {
      path: '/compare/linktree',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/alternatives/[slug]/page.tsx',
    recipeId: 'comparison',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/alternatives/[slug]/page.tsx',
      'hero',
      'content-prose',
      'feature-grid',
      'cta',
      'faq'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/alternatives/*',
    healthCheck: {
      path: '/alternatives/linktree',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/blog/page.tsx',
    recipeId: 'blog-landing',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/blog/page.tsx',
      'hero',
      'blog-feed'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog',
  },
  {
    glob: '(marketing)/blog/category/[slug]/page.tsx',
    recipeId: 'blog-landing',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/blog/category/[slug]/page.tsx',
      'hero',
      'blog-feed'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/category/*',
    healthCheck: {
      path: '/blog/category/artist-management',
      expected: 'page',
    },
  },
  // waitlist — public auth front door; route lives outside (marketing)/ but manifest binds it
  {
    glob: 'waitlist/page.tsx',
    recipeId: 'waitlist',
    renderedSections: [
      approvedBinding(
        'apps/web/components/features/auth/AuthLayout.tsx',
        'hero'
      ),
      approvedBinding(
        'apps/web/components/features/auth/AuthShell.tsx',
        'capture'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source:
        'source binding audit 2026-09-01; JOV-5376 public waitlist front door',
      notes:
        'WaitlistPublicLanding composes the splash-B AuthLayout and sign-up AuthShell capture form for the signed-out public state. The stub recipe remains intentionally incomplete.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/waitlist',
    healthCheck: {
      path: '/waitlist',
      expected: 'page',
      waitFor: '#auth-form',
      allowsAuthShell: true,
      requiresSharedChrome: false,
    },
  },

  // ── Exemptions (sanctioned per DX2 — linearId + approvedBy + prUrl required) ──
  {
    glob: 'waitlist/invite/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'secure invite redemption flow — auth/token outcome page, not marketing page chrome or section-composable content',
      linearId: 'JOV-5650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16742',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/waitlist/invite',
    healthCheck: {
      path: '/waitlist/invite',
      expected: 'page',
      requiresSharedChrome: false,
    },
  },
  {
    glob: '(marketing)/ai/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'noindex public brief — hand-rolled <main> layout, no marketing shell; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/ai',
    noindex: true,
  },
  {
    glob: '(marketing)/blog/[slug]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'dynamic content page — article body via BlogPostPage organism; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/*',
    healthCheck: {
      path: '/blog/the-contact-problem',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/blog/authors/[username]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'dynamic content page — author card + post list; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/authors/*',
    healthCheck: {
      path: '/blog/authors/tim',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/integrations/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-8012 shared connector capability projection',
    },
    exempt: {
      reason:
        'generated application reference — projects configured, implemented capabilities from the canonical connector registry; not recipe-composable',
      linearId: 'JOV-8012',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/20958',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/integrations',
  },
  {
    glob: '(marketing)/changelog/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'generated content page — rendered from repo CHANGELOG.md via lib/changelog-parser.ts; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/changelog',
  },
  {
    glob: '(marketing)/changelog/[version]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5650 route manifest sweep',
      notes:
        'Generated release detail page is backed by CHANGELOG.md content and ChangelogTimeline, not a recipe-composable marketing page.',
    },
    exempt: {
      reason:
        'generated changelog detail page - release body comes from CHANGELOG.md; not recipe-composable',
      linearId: 'JOV-5650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16742',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/changelog/*',
    healthCheck: {
      path: '/changelog/26.8.1',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/demo/video/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'noindex demo surface — renders features/demo/DemoVideoPage; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/demo/video',
    noindex: true,
  },
  {
    glob: '(marketing)/demovideo/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason: 'noindex duplicate of /demo/video — identical body; legacy route',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/demovideo',
    noindex: true,
  },
  {
    glob: '(marketing)/renders/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'internal render surface — screenshot-capture index for marketing renders',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders',
  },
  {
    glob: '(marketing)/renders/[state]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'internal render surface — profile showcase states; dynamicParams = false',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders/*',
    healthCheck: {
      path: '/renders/catalog',
      expected: 'page',
    },
  },
  {
    glob: '(profile-admission)/renders/profile-admission/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5650 route manifest sweep',
      notes:
        'E2E-only fixture is guarded by the profile-admission runtime flag and exists to render synthetic profile admission states.',
    },
    exempt: {
      reason:
        'internal E2E profile-admission fixture - synthetic render target; not recipe-composable',
      linearId: 'JOV-5650',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16742',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders/profile-admission',
    healthCheck: {
      path: '/renders/profile-admission',
      expected: 'page',
    },
    noindex: true,
  },
  {
    glob: '(marketing)/renders/surfaces/[surface]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'internal render surface — MarketingRenderSurface capture targets',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders/surfaces/*',
    healthCheck: {
      path: '/renders/surfaces/profile',
      expected: 'page',
    },
  },
  {
    glob: '(marketing)/engineering/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason: 'proof-led engineering index - not recipe-composable',
      linearId: 'JOV-5475',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16779',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/engineering',
  },
  {
    glob: '(marketing)/engineering/[slug]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5475 engineering publication route',
      notes:
        'Dynamic public articles are eligible only after publication evidence passes; no published slug exists to use as synthetic health proof.',
    },
    exempt: {
      reason:
        'evidence-gated engineering article body - dynamic publication content is not recipe-composable',
      linearId: 'JOV-5475',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16779',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/engineering/*',
    healthCheck: {
      path: '/engineering/verified-changelog',
      expected: 'not-found',
    },
  },
  {
    glob: '(marketing)/engineering/preview/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason: 'noindex founder preview gallery - drafts stay unpublished',
      linearId: 'JOV-5475',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16779',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/engineering/preview',
    noindex: true,
  },
  {
    glob: '(marketing)/engineering/preview/[slug]/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'JOV-5475 engineering preview route',
      notes:
        'Founder-only noindex preview renders unpublished article evidence and is not a public recipe-composable page.',
    },
    exempt: {
      reason:
        'noindex founder preview article - unpublished evidence review surface',
      linearId: 'JOV-5475',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/16779',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/engineering/preview/*',
    healthCheck: {
      path: '/engineering/preview/verified-changelog',
      expected: 'page',
    },
    noindex: true,
  },
] as const;

export type MarketingRouteDisposition =
  | 'active-verified'
  | 'active-unverified'
  | 'explicit-exempt'
  | 'noindex'
  | 'internal'
  | 'deprecated'
  | 'unknown';

export interface MarketingRouteDispositionLedgerEntry {
  readonly key: string;
  readonly url: string;
  readonly sourcePath: string;
  readonly fixturePath: string;
  readonly disposition: MarketingRouteDisposition;
  readonly evidenceSource: string;
  readonly notes?: string;
}

function getRouteDisposition(
  entry: RouteManifestEntry
): MarketingRouteDisposition {
  if (entry.status === 'deprecated' || entry.status === 'removed') {
    return 'deprecated';
  }
  if (isRenderFixturePathname(entry.url)) {
    return 'internal';
  }
  if (entry.noindex) {
    return 'noindex';
  }
  if (entry.exempt) {
    return 'explicit-exempt';
  }
  if (entry.status === 'active') {
    if (entry.bindingEvidence.status === 'verified') {
      return 'active-verified';
    }
    if (entry.bindingEvidence.status === 'unverified') {
      return 'active-unverified';
    }
  }
  return 'unknown';
}

/** Generated route inventory; the canonical manifest remains its only input. */
export const MARKETING_ROUTE_DISPOSITION_LEDGER: readonly MarketingRouteDispositionLedgerEntry[] =
  MARKETING_ROUTE_MANIFEST.map(entry => ({
    key: entry.glob,
    url: entry.url,
    sourcePath: `apps/web/app/${entry.glob}`,
    fixturePath: entry.healthCheck?.path ?? entry.url,
    disposition: getRouteDisposition(entry),
    evidenceSource: entry.bindingEvidence.source,
    ...(entry.bindingEvidence.notes
      ? { notes: entry.bindingEvidence.notes }
      : entry.exempt?.reason
        ? { notes: entry.exempt.reason }
        : {}),
  }));

export type MarketingRouteCaptureViewport = 'desktop' | 'mobile';
export type MarketingRouteCaptureState =
  | 'anonymous-default'
  | 'anonymous-public';

export interface MarketingExactPublicRouteTarget {
  readonly url: string;
  readonly glob: string;
  readonly fixturePath: string;
  readonly expectedPath: string;
  readonly sourcePath: string;
  readonly disposition: MarketingRouteDisposition;
  readonly viewports: readonly MarketingRouteCaptureViewport[];
  readonly stateMatrix: readonly MarketingRouteCaptureState[];
  readonly expectedRuntimeSelector: string;
  readonly sourceSha: 'capture-time-git-sha';
}

/** Exact, non-internal active page routes consumed by both capture systems. */
export const MARKETING_EXACT_PUBLIC_ROUTE_TARGETS: readonly MarketingExactPublicRouteTarget[] =
  MARKETING_ROUTE_MANIFEST.filter(
    entry =>
      entry.status === 'active' &&
      (entry.healthCheck?.expected ?? 'page') === 'page' &&
      !entry.url.includes('*') &&
      !isRenderFixturePathname(entry.url)
  ).map(entry => ({
    url: entry.url,
    glob: entry.glob,
    fixturePath: entry.healthCheck?.path ?? entry.url,
    expectedPath: entry.healthCheck?.path ?? entry.url,
    sourcePath: `apps/web/app/${entry.glob}`,
    disposition: getRouteDisposition(entry),
    viewports: ['desktop', 'mobile'],
    stateMatrix:
      entry.url === '/waitlist' ? ['anonymous-public'] : ['anonymous-default'],
    expectedRuntimeSelector: entry.healthCheck?.waitFor ?? 'main',
    sourceSha: 'capture-time-git-sha',
  }));

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers (used by the manifest gate)
// ─────────────────────────────────────────────────────────────────────────────

const MANIFEST_BY_GLOB: Readonly<Record<string, RouteManifestEntry>> =
  Object.fromEntries(
    MARKETING_ROUTE_MANIFEST.map(e => [e.glob, e])
  ) as Readonly<Record<string, RouteManifestEntry>>;

export function getRouteManifestEntry(glob: string): RouteManifestEntry | null {
  return MANIFEST_BY_GLOB[glob] ?? null;
}

export function isExempt(glob: string): boolean {
  return MANIFEST_BY_GLOB[glob]?.exempt !== undefined;
}

export function isRecipeRoute(glob: string): boolean {
  return MANIFEST_BY_GLOB[glob]?.recipeId !== undefined;
}

export interface MarketingRouteHealthTarget {
  readonly glob: string;
  readonly path: string;
  readonly expected: 'page' | 'redirect' | 'not-found';
  readonly allowedFinalPaths: readonly string[];
  readonly allowsAuthShell: boolean;
  readonly requiresSharedChrome: boolean;
}

/**
 * Resolve the concrete route target used by the hard pre-migration gate.
 * Wildcards cannot be handed to a browser, so they fail closed unless the
 * manifest declares an explicit fixture path.
 */
export function getMarketingRouteHealthTarget(
  entry: RouteManifestEntry
): MarketingRouteHealthTarget {
  const healthCheck = entry.healthCheck;
  const path = healthCheck?.path ?? entry.url;

  if (path.includes('*')) {
    throw new Error(
      `Marketing route ${entry.glob} has no concrete healthCheck.path; wildcard targets are not valid render evidence`
    );
  }
  if (!path.startsWith('/')) {
    throw new Error(
      `Marketing route ${entry.glob} has an invalid healthCheck.path; use a concrete absolute path`
    );
  }

  const expected = healthCheck?.expected ?? 'page';
  const allowedFinalPaths = healthCheck?.allowedFinalPaths ?? [];
  if (expected === 'redirect' && allowedFinalPaths.length === 0) {
    throw new Error(
      `Marketing route ${entry.glob} declares a redirect health check without an allowed final path`
    );
  }

  if (
    allowedFinalPaths.some(
      finalPath => !finalPath.startsWith('/') || finalPath.includes('*')
    )
  ) {
    throw new Error(
      `Marketing route ${entry.glob} declares an invalid redirect target; use concrete absolute paths`
    );
  }

  return {
    glob: entry.glob,
    path,
    expected,
    allowedFinalPaths,
    allowsAuthShell: healthCheck?.allowsAuthShell ?? false,
    // Exemptions remain render-gated, but their eventual shell migration is a
    // separate workstream. Recipe routes must prove the shared shell now.
    requiresSharedChrome:
      healthCheck?.requiresSharedChrome ?? entry.recipeId !== undefined,
  };
}

export const MARKETING_ROUTE_HEALTH_TARGETS: readonly MarketingRouteHealthTarget[] =
  MARKETING_ROUTE_MANIFEST.map(getMarketingRouteHealthTarget);

export interface RouteRecipeParityReport {
  readonly url: string;
  readonly evidenceStatus: RouteManifestEntry['bindingEvidence']['status'];
  readonly expectedSectionIds: readonly MarketingSectionId[];
  readonly actualSectionIds: readonly MarketingSectionId[];
  readonly matches: boolean | null;
}

export function getRouteRecipeParity(
  entry: RouteManifestEntry
): RouteRecipeParityReport {
  const expectedSectionIds = entry.recipeId
    ? getMarketingRecipe(entry.recipeId).sectionOrder
    : [];
  const actualSectionIds = entry.renderedSections.flatMap(binding =>
    binding.kind === 'approved-section' ? [binding.sectionId] : []
  );
  const canCompare =
    entry.bindingEvidence.status === 'verified' && entry.recipeId !== undefined;
  return {
    url: entry.url,
    evidenceStatus: entry.bindingEvidence.status,
    expectedSectionIds,
    actualSectionIds,
    matches: canCompare
      ? expectedSectionIds.length === actualSectionIds.length &&
        expectedSectionIds.every((sectionId, index) =>
          Object.is(sectionId, actualSectionIds[index])
        )
      : null,
  };
}

/**
 * Exemption ratchet baseline — the count of UNSANCTIONED exemptions (those
 * without linearId/approvedBy/prUrl) at spec version 1.0.0. The manifest gate
 * asserts this count never increases. Sanctioned exemptions (with all three
 * fields) are ratchet-exempt per DX2.
 *
 * At 1.0.0, all exemptions are sanctioned (carry linearId=JOV-4063 etc.) —
 * baseline = 0 unsanctioned. Future unsanctioned exemptions fail the gate.
 */
export const EXEMPTION_RATCHET_BASELINE = {
  specVersion: '1.0.0',
  unsanctionedExemptionCount: 0,
} as const;

/**
 * Deprecation ratchet baseline — count of deprecated section/variant usage
 * at spec version 1.0.0. Decrease-only. Removed usage = hard fail.
 */
export const DEPRECATION_RATCHET_BASELINE = {
  specVersion: '1.0.0',
  deprecatedUsageCount: 0,
} as const;
