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
    }
  | {
      readonly kind: 'proposal';
      readonly proposalId: ProposedSectionId;
    };

const approvedBinding = (
  componentPath: string,
  sectionId: MarketingSectionId,
  variantId?: string
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
  variantId: string
): RenderedSectionBinding =>
  approvedBinding(componentPath, sectionId, variantId);

/** A route entry — either bound to a recipe or exempt with a sanctioned reason. */
export interface RouteManifestEntry {
  /** Route glob relative to apps/web/app/ (e.g. '(marketing)/about/page.tsx', '(home)/page.tsx'). */
  readonly glob: string;
  /** Recipe this route implements — required unless `exempt`. */
  readonly recipeId?: RecipeId;
  /** Ordered production bindings. Repeated section ids are legal recipe beats. */
  readonly renderedSections: readonly RenderedSectionBinding[];
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
    readonly allowedFinalPaths?: readonly string[];
    readonly allowsAuthShell?: boolean;
    readonly requiresSharedChrome?: boolean;
  };
  /** noindex flag — true if the route is noindex today (e.g. /ai, /investors, /demo/video). */
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
 * (marketing), (home), and waitlist is represented exactly once. Dynamic
 * engineering article routes are explicit exemptions rather than being hidden
 * behind their index-route entries. This array is the current source authority;
 * generated ledgers and capture catalogs derive their counts instead of copying
 * a prose inventory that can drift.
 *
 * Exemptions are sanctioned (carry linearId + approvedBy + prUrl) per DX2.
 * The baseline exemption count for the ratchet = current sanctioned count.
 */
export const MARKETING_ROUTE_MANIFEST: readonly RouteManifestEntry[] = [
  // ── Proven recipes ────────────────────────────────────────────────────────
  {
    glob: '(home)/page.tsx',
    recipeId: 'homepage',
    renderedSections: approvedBindings('apps/web/app/(home)/page.tsx', 'hero'),
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
      notes:
        'Live route audit; feature-flagged story variants are not certified as recipe parity.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/',
  },
  {
    glob: '(marketing)/new/page.tsx',
    recipeId: 'homepage',
    renderedSections: [
      ...approvedBindings(
        'components/marketing/homepage-v2/HomepageV2Route.tsx',
        'hero',
        'logo-cloud',
        'feature-split',
        'feature-split',
        'feature-split',
        'spec-wall',
        'social-proof'
      ),
      approvedVariantBinding(
        'apps/web/components/marketing/homepage-v2/HomepageV2Ctas.tsx',
        'pricing',
        'tier-cards-recommended'
      ),
      ...approvedBindings(
        'components/marketing/homepage-v2/HomepageV2Route.tsx',
        'cta'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-07-11',
    },
    status: 'active',
    specVersion: '1.2.0',
    url: '/new',
    aliasOf: '/',
  },
  {
    glob: '(marketing)/pricing/page.tsx',
    recipeId: 'pricing',
    renderedSections: [
      ...approvedBindings('apps/web/app/(marketing)/pricing/page.tsx', 'hero'),
      approvedVariantBinding(
        'apps/web/app/(marketing)/pricing/page.tsx',
        'pricing',
        'tier-cards-neutral'
      ),
      ...approvedBindings(
        'apps/web/app/(marketing)/pricing/page.tsx',
        'logo-cloud',
        'comparison',
        'faq',
        'cta'
      ),
    ],
    bindingEvidence: {
      status: 'verified',
      source: 'route audit 2026-09-04',
      notes:
        'Canonical plan cards lead into the experience logo bar, comparison, FAQ, and close. Customer proof is omitted until verified evidence exists.',
    },
    status: 'active',
    specVersion: '1.2.0',
    url: '/pricing',
  },
  {
    glob: '(marketing)/artist-profiles/page.tsx',
    recipeId: 'artist-lp',
    renderedSections: approvedBindings(
      'components/marketing/artist-profile/ArtistProfileLandingRoute.tsx',
      'hero',
      'logo-cloud',
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
      source: 'route audit 2026-08-02',
      notes: 'Release-cycle gallery is product evidence, not social proof.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-profiles',
  },
  {
    glob: '(marketing)/artist-profile/page.tsx',
    recipeId: 'artist-lp',
    renderedSections: approvedBindings(
      'components/marketing/artist-profile/ArtistProfileLandingRoute.tsx',
      'hero',
      'logo-cloud',
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
      source: 'route audit 2026-08-02',
      notes:
        'Alias renders the same route component and chrome as /artist-profiles. Release-cycle gallery is product evidence, not social proof.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-profile',
    aliasOf: '/artist-profiles',
  },
  {
    glob: '(marketing)/artist-notifications/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'components/marketing/artist-notifications/ArtistNotificationsLanding.tsx',
      'hero',
      'logo-cloud',
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
        'Uses the authenticated chat merch creation flow; product concepts are illustrative and not proof claims.',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/instant-merch',
  },
  {
    glob: '(marketing)/youtube-thumbnails/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.tsx',
      'hero',
      'how-it-works',
      'feature-grid',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'route implementation 2026-09-02 (JOV-5862)',
      notes:
        'Paste-channel hero with one primary action; no standalone SKU or pricing section. Uses canonical System B marketing primitives without identity imagery.',
    },
    status: 'active',
    specVersion: '1.2.0',
    url: '/youtube-thumbnails',
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
    glob: '(marketing)/product/[[...slug]]/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/components/marketing/MarketingInformationPage.tsx',
      'hero',
      'feature-grid'
    ),
    bindingEvidence: {
      status: 'unverified',
      source: 'JOV-5997 canonical information architecture',
      notes:
        'Typed shared composition serves /product and its four canonical capability routes; browser certification remains separate.',
    },
    status: 'active',
    specVersion: '1.2.0',
    url: '/product/*',
    healthCheck: {
      path: '/product',
      expected: 'page',
      waitFor: '#marketing-information-heading',
      requiresSharedChrome: true,
    },
  },
  {
    glob: '(marketing)/for/[[...slug]]/page.tsx',
    recipeId: 'feature',
    renderedSections: approvedBindings(
      'apps/web/components/marketing/MarketingInformationPage.tsx',
      'hero',
      'feature-grid'
    ),
    bindingEvidence: {
      status: 'unverified',
      source: 'JOV-5997 canonical information architecture',
      notes:
        'Typed shared composition serves /for and its four truthful persona routes; early-access boundaries are explicit in content.',
    },
    status: 'active',
    specVersion: '1.2.0',
    url: '/for/*',
    healthCheck: {
      path: '/for',
      expected: 'page',
      waitFor: '#marketing-information-heading',
      requiresSharedChrome: true,
    },
  },
  ...[
    ['how-it-works', '/how-it-works'],
    ['tools', '/tools'],
    ['integrations', '/integrations'],
  ].map(([route, url]) => ({
    glob: `(marketing)/${route}/page.tsx`,
    recipeId: 'feature' as const,
    renderedSections: approvedBindings(
      'apps/web/components/marketing/MarketingInformationPage.tsx',
      'hero',
      'feature-grid'
    ),
    bindingEvidence: {
      status: 'unverified' as const,
      source: 'JOV-5997 canonical information architecture',
      notes:
        'Shared typed composition is source-conformant; browser certification remains separate.',
    },
    status: 'active' as const,
    specVersion: '1.2.0',
    url,
    healthCheck: {
      path: url,
      expected: 'page' as const,
      waitFor: '#marketing-information-heading',
      requiresSharedChrome: true,
    },
  })),
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
      'faq',
      'cta'
    ),
    bindingEvidence: {
      status: 'verified',
      source: 'source binding audit 2026-09-01',
      notes:
        'SupportPageContent renders MarketingHero, SupportChannels as the prose/help body, FaqSection, and SupportCta in that order.',
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
    glob: '(marketing)/investors/page.tsx',
    renderedSections: [],
    bindingEvidence: {
      status: 'exempt',
      source: 'sanctioned route manifest exemption',
    },
    exempt: {
      reason:
        'noindex investor brief — hand-rolled layout; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/13460',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/investors',
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
    glob: '(marketing)/renders/profile-admission/page.tsx',
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
  if (entry.url === '/renders' || entry.url.startsWith('/renders/')) {
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
      entry.url !== '/renders' &&
      !entry.url.startsWith('/renders/')
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
