import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DASHBOARD_NAV_ROOT = resolve(
  process.cwd(),
  'components/features/dashboard'
);

function readDashboardSource(relativePath: string): string {
  return readFileSync(resolve(DASHBOARD_NAV_ROOT, relativePath), 'utf8');
}

describe('artist dashboard navigation admin boundary', () => {
  it('keeps the artist navigation config free of admin imports and sections', () => {
    const source = readDashboardSource('dashboard-nav/config.ts');

    expect(source).not.toContain('@/constants/admin-navigation');
    expect(source).not.toMatch(/\badminNavigation(?:Sections)?\b/);
    expect(source).not.toMatch(/\badminSettingsNavigation\b/);
    expect(source).not.toMatch(/\badminSettingsNavItem\b/);
    expect(source).not.toMatch(/\bADMIN_/);
  });

  it('does not render admin sections from artist desktop or mobile navigation', () => {
    const desktopSource = readDashboardSource('dashboard-nav/DashboardNav.tsx');
    const mobileSource = readDashboardSource(
      'organisms/DashboardMobileTabs.tsx'
    );
    const indexSource = readDashboardSource('dashboard-nav/index.ts');

    expect(desktopSource).not.toContain('adminNavigationSections');
    expect(desktopSource).not.toContain("label='Admin'");
    expect(mobileSource).not.toContain('adminNavigation');
    expect(mobileSource).not.toContain('adminItems=');
    expect(indexSource).not.toContain('adminNavigation');
  });
});
