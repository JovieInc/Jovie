import {
  CANONICAL_SURFACES,
  type CanonicalSurfaceDefinition,
  type CanonicalSurfaceId,
} from '@/lib/canonical-surfaces';
import type { ScreenshotScenario } from '@/lib/screenshots/types';
import type { VisualQaSurface } from '@/lib/visual-qa/types';

export const CANONICAL_WEB_SURFACE_AUDIT_IDS = [
  'homepage',
  'public-profile',
  'release-landing',
  'dashboard-releases',
] as const satisfies readonly CanonicalSurfaceId[];

export type CanonicalWebSurfaceAuditId =
  (typeof CANONICAL_WEB_SURFACE_AUDIT_IDS)[number];

export const REDIRECT_ONLY_PUBLIC_ROUTES = ['/ai', '/investors'] as const;

export type CanonicalSurfaceDriftIssue = {
  readonly code: string;
  readonly id: string;
  readonly detail?: string;
};

export interface CanonicalSurfaceOwnershipContract {
  readonly liveSourcePaths: readonly string[];
  readonly requiredTokens: readonly string[];
  readonly forbiddenTokens: readonly string[];
  readonly registryOwnerNeedle: string;
  readonly moleculeOwners: readonly string[];
  readonly familyToken: string;
}

export const CANONICAL_WEB_SURFACE_OWNERSHIP = {
  homepage: {
    liveSourcePaths: [
      'apps/web/app/(home)/page.tsx',
      'apps/web/app/(home)/layout.tsx',
    ],
    requiredTokens: [
      'MarketingPosterHero',
      'PublicPageShell',
      'HomepageV2FinalCta',
    ],
    forbiddenTokens: ['HomePageNarrative'],
    registryOwnerNeedle: 'MarketingPosterHero',
    moleculeOwners: ['PublicPageShell', 'MarketingPosterHero'],
    familyToken: 'features/home',
  },
  'public-profile': {
    liveSourcePaths: [
      'apps/web/app/[username]/page.tsx',
      'apps/web/components/features/profile/StaticArtistPage.tsx',
    ],
    requiredTokens: ['StaticArtistPage', 'ProfileCompactTemplate'],
    forbiddenTokens: [],
    registryOwnerNeedle: 'StaticArtistPage',
    moleculeOwners: ['ProfileCompactTemplate'],
    familyToken: 'features/profile',
  },
  'release-landing': {
    liveSourcePaths: ['apps/web/app/r/[slug]/ReleaseLandingPage.tsx'],
    requiredTokens: ['ReleaseLandingPage', 'SmartLinkShell'],
    forbiddenTokens: [],
    registryOwnerNeedle: 'ReleaseLandingPage',
    moleculeOwners: ['SmartLinkShell'],
    familyToken: 'features/release',
  },
  'dashboard-releases': {
    liveSourcePaths: [
      'apps/web/app/app/(shell)/dashboard/releases/page.tsx',
      'apps/web/app/app/(shell)/dashboard/releases/ReleasesPageClient.tsx',
      'apps/web/app/app/(shell)/dashboard/releases/ReleaseCatalogPageClient.tsx',
      'apps/web/components/features/demo/DemoReleasesExperience.tsx',
    ],
    requiredTokens: [
      'ShellReleasesView',
      'ReleasesPageClient',
      'ReleasesExperience',
    ],
    forbiddenTokens: [],
    registryOwnerNeedle: 'ShellReleasesView',
    moleculeOwners: ['ShellReleasesView'],
    familyToken: 'release-provider-matrix',
  },
} as const satisfies Record<
  CanonicalWebSurfaceAuditId,
  CanonicalSurfaceOwnershipContract
>;

function pushIssue(
  issues: CanonicalSurfaceDriftIssue[],
  code: string,
  id: string,
  detail?: string
) {
  issues.push(detail ? { code, id, detail } : { code, id });
}

function routePath(route: string): string {
  const [path] = route.split('?');
  return path || route;
}

function screenshotRouteMatchesSurface(
  scenario: ScreenshotScenario,
  surface: CanonicalSurfaceDefinition
): boolean {
  const scenarioPath = routePath(scenario.route);
  if (scenarioPath === surface.demoRoute) return true;
  if (scenarioPath === surface.reviewRoute) return true;
  return surface.liveRoutes.includes(scenarioPath);
}

function visualQaRouteBelongsToSurface(
  route: string,
  surface: CanonicalSurfaceDefinition,
  screenshotScenarios: readonly ScreenshotScenario[]
): boolean {
  const path = routePath(route);
  if (path === surface.demoRoute || path === surface.reviewRoute) {
    return true;
  }
  if (surface.liveRoutes.includes(path)) {
    return true;
  }
  return screenshotScenarios.some(
    scenario =>
      surface.screenshotIds.includes(scenario.id) &&
      routePath(scenario.route) === path
  );
}

export function validateCanonicalSurfaceDrift({
  surfaces = CANONICAL_SURFACES,
  screenshotScenarios,
  visualQaSurfaces = [],
  readSource,
}: {
  readonly surfaces?: readonly CanonicalSurfaceDefinition[];
  readonly screenshotScenarios: readonly ScreenshotScenario[];
  readonly visualQaSurfaces?: readonly VisualQaSurface[];
  readonly readSource: (relativePath: string) => string | null;
}): readonly CanonicalSurfaceDriftIssue[] {
  const issues: CanonicalSurfaceDriftIssue[] = [];
  const screenshotById = new Map(
    screenshotScenarios.map(scenario => [scenario.id, scenario])
  );

  for (const id of CANONICAL_WEB_SURFACE_AUDIT_IDS) {
    const surface = surfaces.find(candidate => candidate.id === id);
    if (!surface) {
      pushIssue(issues, 'missing-canonical-surface', id);
      continue;
    }

    const ownership = CANONICAL_WEB_SURFACE_OWNERSHIP[id];
    if (
      !surface.sourceComponent.includes(ownership.registryOwnerNeedle) &&
      !surface.routeOwner.includes(ownership.registryOwnerNeedle)
    ) {
      pushIssue(
        issues,
        'stale-canonical-owner',
        id,
        ownership.registryOwnerNeedle
      );
    }

    if (!surface.componentFamily.includes(ownership.familyToken)) {
      pushIssue(issues, 'detached-canonical-owner', id, ownership.familyToken);
    }

    for (const liveRoute of surface.liveRoutes) {
      if (
        (REDIRECT_ONLY_PUBLIC_ROUTES as readonly string[]).includes(liveRoute)
      ) {
        pushIssue(issues, 'redirect-only-canonical-surface', id, liveRoute);
      }
    }

    for (const screenshotId of surface.screenshotIds) {
      const scenario = screenshotById.get(screenshotId);
      if (!scenario) {
        pushIssue(issues, 'unknown-screenshot', id, screenshotId);
        continue;
      }
      if (!screenshotRouteMatchesSurface(scenario, surface)) {
        pushIssue(issues, 'screenshot-route-mismatch', id, screenshotId);
      }
    }

    const liveSources = ownership.liveSourcePaths.map(relativePath => ({
      relativePath,
      source: readSource(relativePath),
    }));

    for (const file of liveSources) {
      if (file.source === null) {
        pushIssue(issues, 'missing-live-source', id, file.relativePath);
      }
    }

    const combinedSource = liveSources
      .map(file => file.source ?? '')
      .join('\n');

    for (const token of ownership.requiredTokens) {
      if (!combinedSource.includes(token)) {
        pushIssue(issues, 'detached-canonical-owner', id, token);
      }
    }

    for (const token of ownership.forbiddenTokens) {
      if (combinedSource.includes(token)) {
        pushIssue(issues, 'retired-canonical-owner', id, token);
      }
    }

    for (const molecule of ownership.moleculeOwners) {
      if (!combinedSource.includes(molecule)) {
        pushIssue(issues, 'detached-canonical-owner', id, molecule);
      }
    }

    const familyPresentInSource =
      combinedSource.includes(ownership.familyToken) ||
      liveSources.some(file =>
        file.relativePath.includes(ownership.familyToken)
      );
    if (!familyPresentInSource) {
      pushIssue(issues, 'detached-canonical-owner', id, ownership.familyToken);
    }
  }

  for (const visualQaSurface of visualQaSurfaces) {
    const canonicalId = visualQaSurface.canonicalSurfaceId;
    if (!canonicalId) continue;
    if (
      !(CANONICAL_WEB_SURFACE_AUDIT_IDS as readonly string[]).includes(
        canonicalId
      )
    ) {
      continue;
    }

    const surface = surfaces.find(candidate => candidate.id === canonicalId);
    if (!surface) {
      pushIssue(issues, 'missing-canonical-surface', visualQaSurface.id);
      continue;
    }

    if (
      !visualQaRouteBelongsToSurface(
        visualQaSurface.baseline.route,
        surface,
        screenshotScenarios
      )
    ) {
      pushIssue(
        issues,
        'canonical-surface-id-mismatch',
        visualQaSurface.id,
        visualQaSurface.baseline.route
      );
    }
  }

  return issues;
}
