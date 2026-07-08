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
 * app/(marketing)/ — manifest must include (home). Also app/waitlist/page.tsx
 * lives outside (marketing) entirely — manifest must include it for the
 * waitlist recipe (currently stub tier).
 */

import type { RecipeId } from './recipes';

/** A route entry — either bound to a recipe or exempt with a sanctioned reason. */
export interface RouteManifestEntry {
  /** Route glob relative to apps/web/app/ (e.g. '(marketing)/about/page.tsx', '(home)/page.tsx'). */
  readonly glob: string;
  /** Recipe this route implements — required unless `exempt`. */
  readonly recipeId?: RecipeId;
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
 * The route manifest. Per codebase-baseline §1 — 26 page.tsx under (marketing)/
 * + (home)/page.tsx + app/waitlist/page.tsx = 28 entries.
 *
 * Exemptions are sanctioned (carry linearId + approvedBy + prUrl) per DX2.
 * The baseline exemption count for the ratchet = current sanctioned count.
 */
export const MARKETING_ROUTE_MANIFEST: readonly RouteManifestEntry[] = [
  // ── Proven recipes ────────────────────────────────────────────────────────
  {
    glob: '(home)/page.tsx',
    recipeId: 'homepage',
    status: 'active',
    specVersion: '1.0.0',
    url: '/',
  },
  {
    glob: '(marketing)/new/page.tsx',
    recipeId: 'homepage',
    status: 'active',
    specVersion: '1.0.0',
    url: '/new',
    aliasOf: '/',
  },
  {
    glob: '(marketing)/pricing/page.tsx',
    recipeId: 'pricing',
    status: 'active',
    specVersion: '1.0.0',
    url: '/pricing',
  },
  {
    glob: '(marketing)/launch/pricing/page.tsx',
    recipeId: 'pricing',
    status: 'active',
    specVersion: '1.0.0',
    url: '/launch/pricing',
  },
  {
    glob: '(marketing)/artist-profiles/page.tsx',
    recipeId: 'artist-lp',
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-profiles',
  },
  {
    glob: '(marketing)/artist-profile/page.tsx',
    recipeId: 'artist-lp',
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-profile',
    aliasOf: '/artist-profiles',
  },
  {
    glob: '(marketing)/artist-notifications/page.tsx',
    recipeId: 'feature',
    status: 'active',
    specVersion: '1.0.0',
    url: '/artist-notifications',
  },
  {
    glob: '(marketing)/download/page.tsx',
    recipeId: 'feature',
    status: 'active',
    specVersion: '1.0.0',
    url: '/download',
  },
  {
    glob: '(marketing)/pay/page.tsx',
    recipeId: 'feature',
    status: 'active',
    specVersion: '1.0.0',
    url: '/pay',
  },
  {
    glob: '(marketing)/voice/page.tsx',
    recipeId: 'feature',
    status: 'active',
    specVersion: '1.0.0',
    url: '/voice',
    noindex: true,
  },
  {
    glob: '(marketing)/launch/page.tsx',
    recipeId: 'launch',
    status: 'active',
    specVersion: '1.0.0',
    url: '/launch',
  },
  {
    glob: '(marketing)/about/page.tsx',
    recipeId: 'seo',
    status: 'active',
    specVersion: '1.0.0',
    url: '/about',
  },
  {
    glob: '(marketing)/support/page.tsx',
    recipeId: 'seo',
    status: 'active',
    specVersion: '1.0.0',
    url: '/support',
  },
  {
    glob: '(marketing)/compare/[slug]/page.tsx',
    recipeId: 'comparison',
    status: 'active',
    specVersion: '1.0.0',
    url: '/compare/*',
  },
  {
    glob: '(marketing)/alternatives/[slug]/page.tsx',
    recipeId: 'comparison',
    status: 'active',
    specVersion: '1.0.0',
    url: '/alternatives/*',
  },
  {
    glob: '(marketing)/blog/page.tsx',
    recipeId: 'blog-landing',
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog',
  },
  {
    glob: '(marketing)/blog/category/[slug]/page.tsx',
    recipeId: 'blog-landing',
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/category/*',
  },
  // waitlist — stub recipe; route lives outside (marketing)/ but manifest binds it
  {
    glob: 'waitlist/page.tsx',
    recipeId: 'waitlist',
    status: 'active',
    specVersion: '1.0.0',
    url: '/waitlist',
  },

  // ── Exemptions (sanctioned per DX2 — linearId + approvedBy + prUrl required) ──
  {
    glob: '(marketing)/ai/page.tsx',
    exempt: {
      reason:
        'noindex public brief — hand-rolled <main> layout, no marketing shell; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/ai',
    noindex: true,
  },
  {
    glob: '(marketing)/blog/[slug]/page.tsx',
    exempt: {
      reason:
        'dynamic content page — article body via BlogPostPage organism; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/*',
  },
  {
    glob: '(marketing)/blog/authors/[username]/page.tsx',
    exempt: {
      reason:
        'dynamic content page — author card + post list; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/blog/authors/*',
  },
  {
    glob: '(marketing)/changelog/page.tsx',
    exempt: {
      reason:
        'generated content page — rendered from repo CHANGELOG.md via lib/changelog-parser.ts; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/changelog',
  },
  {
    glob: '(marketing)/demo/video/page.tsx',
    exempt: {
      reason:
        'noindex demo surface — renders features/demo/DemoVideoPage; not section-composed',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/demo/video',
    noindex: true,
  },
  {
    glob: '(marketing)/demovideo/page.tsx',
    exempt: {
      reason: 'noindex duplicate of /demo/video — identical body; legacy route',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/demovideo',
    noindex: true,
  },
  {
    glob: '(marketing)/investors/page.tsx',
    exempt: {
      reason:
        'noindex investor brief — hand-rolled layout; not recipe-composable',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/investors',
    noindex: true,
  },
  {
    glob: '(marketing)/renders/page.tsx',
    exempt: {
      reason:
        'internal render surface — screenshot-capture index for marketing renders',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders',
  },
  {
    glob: '(marketing)/renders/[state]/page.tsx',
    exempt: {
      reason:
        'internal render surface — profile showcase states; dynamicParams = false',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders/*',
  },
  {
    glob: '(marketing)/renders/surfaces/[surface]/page.tsx',
    exempt: {
      reason:
        'internal render surface — MarketingRenderSurface capture targets',
      linearId: 'JOV-4063',
      approvedBy: 'tw',
      prUrl: 'https://github.com/JovieInc/Jovie/pull/TBD',
    },
    status: 'active',
    specVersion: '1.0.0',
    url: '/renders/surfaces/*',
  },
] as const;

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
