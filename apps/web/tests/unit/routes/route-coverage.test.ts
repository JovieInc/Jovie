import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ROUTE_MATRIX,
  EXCLUDED_ROUTES,
} from '../../e2e/utils/dashboard-route-matrix';
import {
  filePathToRoutePath,
  findAllPageFiles,
  normalizeDynamicSegments,
} from '../../e2e/utils/route-coverage-gate';

/**
 * Route coverage gate.
 *
 * Detects page.tsx files that are not registered in the dashboard route matrix
 * or the excluded routes list. This ensures AI-generated pages don't silently
 * ship without being tracked.
 *
 * Currently a warning-only test. Promote to a hard failure once the initial
 * backfill is complete.
 */

function getAllRegisteredRoutes(): Set<string> {
  const routes = new Set<string>();

  for (const group of Object.values(DASHBOARD_ROUTE_MATRIX)) {
    for (const route of group.full) {
      routes.add(normalizeDynamicSegments(route.path));
    }
  }

  return routes;
}

function getAllExcludedPatterns(): string[] {
  return Object.keys(EXCLUDED_ROUTES);
}

function isExcluded(normalizedRoute: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const normalizedPattern = normalizeDynamicSegments(pattern);
    if (normalizedPattern === normalizedRoute) return true;
    // Wildcard matching: /ui/* matches /ui/buttons
    if (normalizedPattern.endsWith('/*')) {
      const prefix = normalizedPattern.slice(0, -2);
      if (
        normalizedRoute === prefix ||
        normalizedRoute.startsWith(prefix + '/')
      )
        return true;
    }
  }
  return false;
}

describe('route coverage', () => {
  const allPages = findAllPageFiles();
  const registeredRoutes = getAllRegisteredRoutes();
  const excludedPatterns = getAllExcludedPatterns();

  it('should find page.tsx files', () => {
    expect(allPages.length).toBeGreaterThan(50);
  });

  it('filePathToRoutePath converts paths correctly', () => {
    // Test route group stripping
    expect(filePathToRoutePath('apps/web/app/(marketing)/about/page.tsx')).toBe(
      '/about'
    );
    // Test nested route groups
    expect(
      filePathToRoutePath('apps/web/app/app/(shell)/settings/account/page.tsx')
    ).toBe('/app/settings/account');
    // Test root page
    expect(filePathToRoutePath('apps/web/app/page.tsx')).toBe('/');
    // Test dynamic segments preserved
    expect(filePathToRoutePath('apps/web/app/[username]/page.tsx')).toBe(
      '/[username]'
    );
  });

  it('reports uncataloged routes (warning only)', () => {
    const uncataloged: Array<{ route: string; file: string }> = [];

    for (const file of allPages) {
      const routePath = filePathToRoutePath(file);
      const normalized = normalizeDynamicSegments(routePath);

      if (registeredRoutes.has(normalized)) continue;
      if (isExcluded(normalized, excludedPatterns)) continue;

      uncataloged.push({ route: normalized, file });
    }

    if (uncataloged.length > 0) {
      const list = uncataloged
        .map(u => `  ${u.route}`)
        .sort()
        .join('\n');

      // Warning only — do not fail the build. Change to expect.fail() once
      // all critical routes are registered.
      console.warn(
        `\n⚠️  Found ${uncataloged.length} uncataloged route(s):\n${list}\n\n` +
          'Add to DASHBOARD_ROUTE_MATRIX or EXCLUDED_ROUTES in\n' +
          'tests/e2e/utils/dashboard-route-matrix.ts\n'
      );
    }

    // Track the coverage percentage with registered vs excluded breakdown
    const totalRoutes = allPages.length;
    const registeredCount = [...allPages].filter(f => {
      const r = normalizeDynamicSegments(filePathToRoutePath(f));
      return registeredRoutes.has(r);
    }).length;
    const excludedCount = totalRoutes - registeredCount - uncataloged.length;
    const coveredRoutes = registeredCount + excludedCount;
    const coveragePercent = Math.round((coveredRoutes / totalRoutes) * 100);

    console.log(
      `Route coverage: ${registeredCount} registered, ${excludedCount} excluded, ${uncataloged.length} uncataloged / ${totalRoutes} total (${coveragePercent}%)`
    );

    // Soft gate: expect at least 50% coverage
    expect(coveragePercent).toBeGreaterThanOrEqual(50);
  });
});
