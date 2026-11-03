import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalSidebarNavigation,
  primaryNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import {
  OPERATOR_NAV_ITEMS,
  OPERATOR_NAV_SECTIONS,
} from '@/components/organisms/operator-navigation';
import {
  ADMIN_NAV_REGISTRY,
  ADMIN_PRIMARY_WORKSPACE_IDS,
  ADMIN_SETTINGS_TOOL_IDS,
  ADMIN_WORKSPACE_TABS,
} from '@/constants/admin-navigation';
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

  it("labels the second operator group Company (Tim's swipe, 2026-10-25), keeping its stable id", () => {
    expect(
      OPERATOR_NAV_SECTIONS.map(section => [section.id, section.label])
    ).toEqual([
      ['home', null],
      ['business', 'Company'],
      ['tools', 'Tools'],
    ]);
    expect(OPERATOR_NAV_SECTIONS.map(section => section.label)).not.toContain(
      'Business'
    );
  });

  it('keeps five daily destinations primary with Company and Tools collapsed', () => {
    expect(ADMIN_PRIMARY_WORKSPACE_IDS).toEqual([
      'overview',
      'inbox',
      'shipping',
      'operations',
      'costs',
    ]);
    expect(
      ADMIN_NAV_REGISTRY.filter(item => item.section === 'workspaces').map(
        item => item.label
      )
    ).toEqual(['Home', 'Inbox', 'Shipping', 'Fleet', 'Capacity']);
    expect(ADMIN_NAV_REGISTRY.map(item => item.id)).not.toContain('needs_you');
    expect(
      ADMIN_NAV_REGISTRY.filter(item => item.section === 'business').map(
        item => item.label
      )
    ).toEqual([
      'Growth',
      'People',
      'Outbound',
      'Interviews',
      'Investors',
      'Revenue Lift',
    ]);
    expect(ADMIN_SETTINGS_TOOL_IDS.slice(0, 2)).toEqual([
      'ops',
      'certifications',
    ]);
    // Product and Timeline are Shipping views, Agents is a Fleet view: they
    // keep their routes but have no sidebar row.
    for (const id of ['product', 'activity']) {
      expect(ADMIN_NAV_REGISTRY.some(item => item.id === id)).toBe(false);
    }
    expect(ADMIN_WORKSPACE_TABS.shipping.map(tab => tab.label)).toEqual([
      'Pipeline',
      'Product',
      'Timeline',
    ]);
    expect(ADMIN_WORKSPACE_TABS.operations.map(tab => tab.label)).toEqual([
      'Health',
      'Agents',
    ]);
    expect(
      ADMIN_NAV_REGISTRY.filter(item =>
        ['certifications', 'shipping'].includes(item.id)
      ).map(({ id, section }) => ({ id, section }))
    ).toEqual([
      { id: 'shipping', section: 'workspaces' },
      { id: 'certifications', section: 'utilities' },
    ]);
    expect(ADMIN_SETTINGS_TOOL_IDS).toContain('certifications');
    expect(
      ADMIN_NAV_REGISTRY.find(item => item.id === 'capacity')
    ).toMatchObject({
      label: 'Agent Plans',
      href: APP_ROUTES.ADMIN_CAPACITY,
      section: 'utilities',
    });
  });

  it('gives every operator review workspace a canonical navigation door', () => {
    const reviewWorkspaces = [
      {
        id: 'interviews',
        href: APP_ROUTES.ADMIN_INTERVIEWS,
        section: 'business',
      },
      {
        id: 'playlists',
        href: APP_ROUTES.ADMIN_PLAYLISTS,
        section: 'utilities',
      },
      { id: 'presence', href: APP_ROUTES.ADMIN_PRESENCE, section: 'utilities' },
    ];

    expect(
      ADMIN_NAV_REGISTRY.filter(item =>
        reviewWorkspaces.some(workspace => workspace.id === item.id)
      ).map(({ id, href, section }) => ({ id, href, section }))
    ).toEqual(reviewWorkspaces);
  });

  it.each([
    ['screenshots', APP_ROUTES.ADMIN_SCREENSHOTS],
    ['system_map', APP_ROUTES.ADMIN_SYSTEM],
  ])('keeps the %s diagnostic outside founder navigation', (id, href) => {
    expect(ADMIN_NAV_REGISTRY.some(item => item.href === href)).toBe(false);
    expect(OPERATOR_NAV_ITEMS.some(item => item.href === href)).toBe(false);
    expect(ADMIN_SETTINGS_TOOL_IDS).not.toContain(id);
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
