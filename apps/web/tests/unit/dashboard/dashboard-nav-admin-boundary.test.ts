import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalSidebarNavigation,
  primaryNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import { OPERATOR_NAV_ITEMS } from '@/components/organisms/operator-navigation';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { resolveAppShellModeFromPathname } from '@/lib/app-shell/mode';

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

describe('exclusive customer vs OV navigation', () => {
  const adminHrefs = ADMIN_NAV_REGISTRY.map(item => item.href);
  const customerHrefs = [
    ...canonicalSidebarNavigation.map(item => item.href),
    ...primaryNavigation.map(item => item.href),
  ];

  it('keeps customer desktop and primary nav free of admin-registry destinations', () => {
    expect(customerHrefs.filter(href => adminHrefs.includes(href))).toEqual([]);
  });

  it('renders OV nav as the admin registry only', () => {
    expect(OPERATOR_NAV_ITEMS.map(item => item.href)).toEqual(adminHrefs);
    expect(OPERATOR_NAV_ITEMS.map(item => item.label)).toEqual(
      ADMIN_NAV_REGISTRY.map(item => item.label)
    );
    expect(
      OPERATOR_NAV_ITEMS.map(item => item.href).filter(href =>
        customerHrefs.includes(href)
      )
    ).toEqual([]);
  });

  it('resolves OV routes to ov mode and customer routes to customer mode', () => {
    expect(resolveAppShellModeFromPathname(APP_ROUTES.DASHBOARD)).toBe(
      'customer'
    );
    expect(resolveAppShellModeFromPathname(APP_ROUTES.CHAT)).toBe('customer');
    expect(resolveAppShellModeFromPathname(APP_ROUTES.CALENDAR)).toBe(
      'customer'
    );
    expect(resolveAppShellModeFromPathname(APP_ROUTES.OV)).toBe('ov');
    expect(resolveAppShellModeFromPathname(`${APP_ROUTES.OV}/ops`)).toBe('ov');
    expect(resolveAppShellModeFromPathname(APP_ROUTES.HUD)).toBe('ov');
  });
});
