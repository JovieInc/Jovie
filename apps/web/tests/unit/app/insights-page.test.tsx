import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('insights page route contract', () => {
  it('uses the shared app shell route context instead of local dashboard loaders', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/app/(shell)/insights/page.tsx'),
      'utf8'
    );

    expect(source).toContain('loadAppShellRouteContext');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('getDashboardDataEssential');
    expect(source).not.toMatch(/\bgetDashboardData\(/);
  });

  it('keeps the audience workspace navigation in the insights panel toolbar', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/dashboard/insights/InsightsPanel.tsx'
      ),
      'utf8'
    );

    // Reuse of the canonical audience workspace navigation primitives —
    // the same RouteSegmentControl + workspace-navigation options the
    // Contacts/Audience tab renders — so Contacts/Audience stay reachable
    // from the insights workspace (dogfood finding, 2026-11-10).
    expect(source).toContain('getAudienceWorkspaceNavigation');
    expect(source).toContain('RouteSegmentControl');
    expect(source).toContain("aria-label='Audience Workspace'");
  });
});
