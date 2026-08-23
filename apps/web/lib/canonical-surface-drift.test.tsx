import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_WEB_SURFACE_AUDIT_IDS,
  CANONICAL_WEB_SURFACE_OWNERSHIP,
  validateCanonicalSurfaceDrift,
} from '@/lib/canonical-surface-drift';
import {
  CANONICAL_SURFACE_REDIRECT_DRIFT_DEFINITION,
  CANONICAL_SURFACE_REDIRECT_FIXTURE_TEST_ID,
  CanonicalSurfaceRedirectDriftFixture,
} from '@/lib/canonical-surface-drift-fixture';
import {
  CANONICAL_SURFACES,
  getCanonicalSurface,
} from '@/lib/canonical-surfaces';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';
import { VISUAL_QA_SURFACES } from '@/lib/visual-qa/registry';
import type { VisualQaSurface } from '@/lib/visual-qa/types';

const repoRoot = path.resolve(__dirname, '../../..');

function readSource(relativePath: string): string | null {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function codes() {
  return validateCanonicalSurfaceDrift({
    screenshotScenarios: SCREENSHOT_SCENARIOS,
    visualQaSurfaces: VISUAL_QA_SURFACES,
    readSource,
  }).map(issue => issue.code);
}

describe('canonical web surface drift guard', () => {
  it('keeps the audited live owners attached to screenshot and visual-qa registries', () => {
    expect(codes()).toEqual([]);

    expect(getCanonicalSurface('homepage').sourceComponent).toContain(
      'MarketingPosterHero'
    );
    expect(getCanonicalSurface('homepage').routeOwner).toContain(
      'PublicPageShell'
    );
    expect(getCanonicalSurface('dashboard-releases').sourceComponent).toContain(
      'ShellReleasesView'
    );

    for (const id of CANONICAL_WEB_SURFACE_AUDIT_IDS) {
      const surface = getCanonicalSurface(id);
      const ownership = CANONICAL_WEB_SURFACE_OWNERSHIP[id];
      expect(surface.componentFamily).toContain(ownership.familyToken);
      expect(surface.liveRoutes).not.toContain('/ai');
      expect(surface.liveRoutes).not.toContain('/investors');
    }
  });

  it('covers idle, empty, and recovery ownership tokens on the live sources', () => {
    const homepage = [
      readSource('apps/web/app/(home)/page.tsx'),
      readSource('apps/web/app/(home)/layout.tsx'),
    ].join('\n');
    const releases = readSource(
      'apps/web/app/app/(shell)/dashboard/releases/ReleaseCatalogPageClient.tsx'
    );

    expect(homepage).toContain('MarketingPosterHero');
    expect(homepage).not.toContain('HomepageV2FinalCta');
    expect(homepage).not.toContain('HomePageNarrative');
    expect(releases).toContain('LibraryLoadingState');
    expect(releases).toContain('PageErrorState');
    expect(releases).toContain("view === 'assets'");
  });

  it('rejects the deliberate-red redirect-surface fixture', () => {
    const driftedSurfaces = CANONICAL_SURFACES.map(surface =>
      surface.id === 'homepage'
        ? CANONICAL_SURFACE_REDIRECT_DRIFT_DEFINITION
        : surface
    );
    const driftedVisualQa: readonly VisualQaSurface[] = [
      {
        id: 'opportunity-inbox-home',
        title: 'Home — opportunity inbox',
        description: 'Deliberate-red mismatch onto dashboard-releases.',
        canonicalSurfaceId: 'dashboard-releases',
        themes: ['dark', 'light'],
        baseline: {
          route: '/app',
          waitFor: '[data-testid="opportunity-inbox-page"]',
          viewport: 'desktop',
        },
      },
    ];

    const issues = validateCanonicalSurfaceDrift({
      surfaces: driftedSurfaces,
      screenshotScenarios: SCREENSHOT_SCENARIOS,
      visualQaSurfaces: driftedVisualQa,
      readSource,
    });
    const issueCodes = issues.map(issue => issue.code);

    expect(issueCodes).toContain('redirect-only-canonical-surface');
    expect(issueCodes).toContain('stale-canonical-owner');
    expect(issueCodes).toContain('unknown-screenshot');
    expect(issueCodes).toContain('canonical-surface-id-mismatch');
  });
});

describe('CanonicalSurfaceRedirectDriftFixture', () => {
  it('is a deliberate-red promotion of redirect-only routes', () => {
    render(<CanonicalSurfaceRedirectDriftFixture />);

    const fixture = screen.getByTestId(
      CANONICAL_SURFACE_REDIRECT_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(screen.getByRole('link', { name: '/ai' }).getAttribute('href')).toBe(
      '/ai'
    );
    expect(
      screen.getByRole('link', { name: '/investors' }).getAttribute('href')
    ).toBe('/investors');
    const liveRoutes = CANONICAL_SURFACES.flatMap(
      surface => surface.liveRoutes
    );
    expect(liveRoutes).not.toContain('/ai');
    expect(liveRoutes).not.toContain('/investors');
    expect(readSource('apps/web/lib/canonical-surfaces.ts')).not.toContain(
      'canonical-surface-drift-fixture'
    );
    expect(readSource('apps/web/lib/visual-qa/registry.ts')).not.toContain(
      'canonical-surface-drift-fixture'
    );
  });
});
