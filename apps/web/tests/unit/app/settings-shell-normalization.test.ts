import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate));
}

const SETTINGS_LAYOUT = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/settings/layout.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/layout.tsx')
);

const REQUIRED_SHARED_SETTINGS_ROUTES = [
  'account',
  'connectors',
  'usage',
  'billing',
  'payments',
  'data-privacy',
  'artist-profile',
  'contacts',
  'touring',
  'analytics',
  'audience',
] as const;

const UNIFIED_SIDEBAR = findSourceFile(
  resolve(process.cwd(), 'components/organisms/UnifiedSidebar.tsx'),
  resolve(process.cwd(), 'apps/web/components/organisms/UnifiedSidebar.tsx')
);

const SETTINGS_POLISHED = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/dashboard/organisms/SettingsPolished.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/dashboard/organisms/SettingsPolished.tsx'
  )
);

const SETTINGS_ALIAS_ROUTES = [
  {
    route: 'settings root',
    expectedDestination: 'APP_ROUTES.SETTINGS_ACCOUNT',
    filePath: findSourceFile(
      resolve(process.cwd(), 'app/app/(shell)/settings/page.tsx'),
      resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/page.tsx')
    ),
  },
  {
    route: 'settings profile',
    expectedDestination: 'APP_ROUTES.SETTINGS_ARTIST_PROFILE',
    filePath: findSourceFile(
      resolve(process.cwd(), 'app/app/(shell)/settings/profile/page.tsx'),
      resolve(
        process.cwd(),
        'apps/web/app/app/(shell)/settings/profile/page.tsx'
      )
    ),
  },
  {
    route: 'settings delete-account',
    expectedDestination: 'APP_ROUTES.SETTINGS_DATA_PRIVACY',
    filePath: findSourceFile(
      resolve(
        process.cwd(),
        'app/app/(shell)/settings/delete-account/page.tsx'
      ),
      resolve(
        process.cwd(),
        'apps/web/app/app/(shell)/settings/delete-account/page.tsx'
      )
    ),
  },
] as const;

const SETTINGS_APPEARANCE_PAGE_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/appearance/page.tsx'),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/settings/appearance/page.tsx'
  ),
] as const;

const SETTINGS_SHARED_ROUTE_CONTEXT_FILES = [
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/contacts/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/contacts/page.tsx'
    )
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/touring/page.tsx'),
    resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/touring/page.tsx')
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/artist-profile/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/artist-profile/page.tsx'
    )
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/admin/page.tsx'),
    resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/admin/page.tsx')
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/payments/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/payments/page.tsx'
    )
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/connectors/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/connectors/page.tsx'
    )
  ),
] as const;

const SETTINGS_SHARED_ROUTE_CONTEXT_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/contacts/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/touring/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/artist-profile/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/admin/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/payments/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/connectors/page.tsx'),
] as const;

const SETTINGS_CONNECTORS_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/settings/connectors/page.tsx'),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/settings/connectors/page.tsx'
  )
);

const GATED_SETTINGS_ROUTE_FILES = [
  {
    route: 'settings admin',
    filePath: findSourceFile(
      resolve(process.cwd(), 'app/app/(shell)/settings/admin/page.tsx'),
      resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/admin/page.tsx')
    ),
    expectedGate: 'routeContext.dashboardData.isAdmin',
    expectedDestination: 'APP_ROUTES.SETTINGS_ARTIST_PROFILE',
  },
  {
    route: 'settings payments',
    filePath: findSourceFile(
      resolve(process.cwd(), 'app/app/(shell)/settings/payments/page.tsx'),
      resolve(
        process.cwd(),
        'apps/web/app/app/(shell)/settings/payments/page.tsx'
      )
    ),
    expectedGate: 'getAppFlagValue',
    expectedDestination: 'APP_ROUTES.SETTINGS_BILLING',
  },
] as const;

describe('settings shell normalization', () => {
  it('keeps the settings route group as the only PageShell owner', () => {
    expect(SETTINGS_LAYOUT).toBeDefined();

    if (!SETTINGS_LAYOUT) {
      throw new Error('Could not find settings layout source');
    }
    const layoutSource = readFileSync(SETTINGS_LAYOUT, 'utf8');
    expect(layoutSource).toContain('<PageShell');
    expect(layoutSource).toContain("data-testid='settings-shell-content'");
  });

  it('centers every required settings route in the post-sidebar main pane', () => {
    expect(SETTINGS_LAYOUT).toBeDefined();

    if (!SETTINGS_LAYOUT) {
      throw new Error('Could not find settings layout source');
    }

    const layoutSource = readFileSync(SETTINGS_LAYOUT, 'utf8');
    expect(layoutSource).toContain(
      "className='mx-auto min-w-0 w-full max-w-(--app-shell-content-max-form) space-y-6'"
    );

    for (const route of REQUIRED_SHARED_SETTINGS_ROUTES) {
      const page = findSourceFile(
        resolve(process.cwd(), `app/app/(shell)/settings/${route}/page.tsx`),
        resolve(
          process.cwd(),
          `apps/web/app/app/(shell)/settings/${route}/page.tsx`
        )
      );
      expect(
        page,
        `${route} must remain under the shared settings layout`
      ).toBeDefined();
      if (!page) continue;

      const pageSource = readFileSync(page, 'utf8');
      expect(
        pageSource,
        `${route} must not create a route-local PageShell`
      ).not.toMatch(/<PageShell\b/);
    }
  });

  it('uses the global shell settings navigation instead of mounting a second in-content sidebar', () => {
    expect(SETTINGS_LAYOUT).toBeDefined();

    if (!SETTINGS_LAYOUT) {
      throw new Error('Could not find settings layout source');
    }

    const layoutSource = readFileSync(SETTINGS_LAYOUT, 'utf8');
    expect(layoutSource).not.toContain('@/features/settings/SettingsSidebar');
    expect(layoutSource).not.toContain('<SettingsSidebar');
    expect(layoutSource).toContain('{children}');
  });

  it('keeps dashboard-nav/config.ts as the only settings navigation source', () => {
    // JOV-7627: the orphaned settings-sidebar-config module defined a second,
    // divergent settings IA (Referral/Appearance/Delete Account) that the live
    // rail never rendered. It must not come back; userSettingsNavigation and
    // artistSettingsNavigation in dashboard-nav/config.ts are the source of
    // truth consumed by UnifiedSidebar and DashboardNav.
    const deadConfig = findSourceFile(
      resolve(
        process.cwd(),
        'components/features/settings/settings-sidebar-config.ts'
      ),
      resolve(
        process.cwd(),
        'apps/web/components/features/settings/settings-sidebar-config.ts'
      )
    );
    expect(deadConfig).toBeUndefined();
  });

  it('keeps SettingsPolished content-only so it cannot restore duplicate navigation', () => {
    expect(SETTINGS_POLISHED).toBeDefined();

    if (!SETTINGS_POLISHED) {
      throw new Error('Could not find SettingsPolished source');
    }

    const source = readFileSync(SETTINGS_POLISHED, 'utf8');
    expect(source).not.toContain('const SettingsSidebar');
    expect(source).not.toContain('<SettingsSidebar');
    expect(source).not.toContain('getSettingsSidebarRowClassName');
  });

  it('keeps global settings navigation and deep links independent of the content layout on every viewport', () => {
    expect(UNIFIED_SIDEBAR).toBeDefined();

    if (!UNIFIED_SIDEBAR) {
      throw new Error('Could not find UnifiedSidebar source');
    }

    const sidebarSource = readFileSync(UNIFIED_SIDEBAR, 'utf8');
    expect(sidebarSource).toContain(
      "const isInSettings = section === 'settings';"
    );
    expect(sidebarSource).toContain(
      '<SettingsNavigation pathname={pathname} section={section} />'
    );
    expect(sidebarSource).toContain('function SettingsNavigation');
  });

  it('keeps legacy settings aliases as lightweight route redirects', () => {
    for (const aliasRoute of SETTINGS_ALIAS_ROUTES) {
      expect(aliasRoute.filePath).toBeDefined();

      if (!aliasRoute.filePath) {
        throw new Error(`Could not find ${aliasRoute.route} source`);
      }

      const source = readFileSync(aliasRoute.filePath, 'utf8');
      expect(source).toContain("import { redirect } from 'next/navigation'");
      expect(source).toContain(`redirect(${aliasRoute.expectedDestination})`);
      expect(source).not.toContain('getDashboardData');
      expect(source).not.toContain('getCachedAuth');
      expect(source).not.toContain('DashboardSettings');
      expect(source).not.toContain('redirect_url=/app/settings');
    }
  });

  it('leaves the legacy appearance alias to the Next.js redirect config', () => {
    for (const filePath of SETTINGS_APPEARANCE_PAGE_CANDIDATES) {
      expect(existsSync(filePath), filePath).toBe(false);
    }
  });

  it('keeps data-backed settings pages on the shared shell route context path', () => {
    const missingFiles = SETTINGS_SHARED_ROUTE_CONTEXT_FILES.filter(
      filePath => !filePath
    );
    expect(missingFiles).toEqual([]);

    for (const filePath of SETTINGS_SHARED_ROUTE_CONTEXT_FILES) {
      if (!filePath) {
        throw new Error(
          `Could not find data-backed settings source. Checked: ${SETTINGS_SHARED_ROUTE_CONTEXT_CANDIDATES.join(', ')}`
        );
      }

      const source = readFileSync(filePath, 'utf8');
      expect(source).toContain('loadAppShellRouteContext');
      expect(source).not.toContain('getDashboardData');
      expect(source).not.toContain('getCachedAuth');
      expect(source).not.toContain('getDashboardShellData');
    }
  });

  it('loads account connections in the Settings Connections page', () => {
    expect(SETTINGS_CONNECTORS_PAGE).toBeDefined();

    if (!SETTINGS_CONNECTORS_PAGE) {
      throw new Error('Could not find settings connectors source');
    }

    const source = readFileSync(SETTINGS_CONNECTORS_PAGE, 'utf8');
    expect(source).toContain('loadAppShellRouteContext');
    expect(source).toContain('loadSettingsConnectorsData');
    expect(source).toContain('ConnectorsClient');
    expect(source).not.toContain('APP_ROUTES.PROFILES');
    expect(source).not.toContain('?add=service');
  });

  it('keeps gated settings pages on server redirects instead of client effects', () => {
    for (const gatedRoute of GATED_SETTINGS_ROUTE_FILES) {
      expect(gatedRoute.filePath).toBeDefined();

      if (!gatedRoute.filePath) {
        throw new Error(`Could not find ${gatedRoute.route} source`);
      }

      const source = readFileSync(gatedRoute.filePath, 'utf8');
      expect(source).toContain('loadAppShellRouteContext');
      expect(source).toContain(gatedRoute.expectedGate);
      expect(source).toContain(`redirect(${gatedRoute.expectedDestination})`);
      expect(source).not.toContain("'use client'");
      expect(source).not.toContain('useRouter');
      expect(source).not.toContain('useEffect');
      expect(source).not.toContain('router.replace');
      expect(source).not.toContain('useAppFlag');
    }
  });
});
