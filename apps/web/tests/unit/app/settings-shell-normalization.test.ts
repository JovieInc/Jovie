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

const RETARGETING_ROUTE_FILES = [
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/retargeting-ads/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/retargeting-ads/page.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'app/app/(shell)/settings/retargeting-ads/loading.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/retargeting-ads/loading.tsx'
    )
  ),
] as const;

const RETARGETING_ROUTE_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/retargeting-ads/page.tsx'),
  resolve(
    process.cwd(),
    'app/app/(shell)/settings/retargeting-ads/loading.tsx'
  ),
] as const;

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
    route: 'settings appearance',
    expectedDestination: 'APP_ROUTES.SETTINGS_ACCOUNT',
    filePath: findSourceFile(
      resolve(process.cwd(), 'app/app/(shell)/settings/appearance/page.tsx'),
      resolve(
        process.cwd(),
        'apps/web/app/app/(shell)/settings/appearance/page.tsx'
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

const SETTINGS_PROFILE_SCOPED_PREFETCH_ROUTES = [
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
] as const;

const SETTINGS_PROFILE_SCOPED_PREFETCH_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/contacts/page.tsx'),
  resolve(process.cwd(), 'app/app/(shell)/settings/touring/page.tsx'),
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

  it('keeps focused settings subroutes inside the parent shell', () => {
    const missingFiles = RETARGETING_ROUTE_FILES.filter(filePath => !filePath);
    expect(missingFiles).toEqual([]);

    for (const filePath of RETARGETING_ROUTE_FILES) {
      if (!filePath) {
        throw new Error(
          `Could not find retargeting settings source. Checked: ${RETARGETING_ROUTE_CANDIDATES.join(', ')}`
        );
      }
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toMatch(/<PageShell\b/);
      expect(source).not.toMatch(/import\s*\{[^}]*PageShell/);
      expect(source).not.toMatch(/<PageContent\b/);
      expect(source).not.toMatch(/import\s*\{[^}]*PageContent/);
    }
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

  it('keeps profile-scoped settings prefetches on the shell data path', () => {
    const missingFiles = SETTINGS_PROFILE_SCOPED_PREFETCH_ROUTES.filter(
      filePath => !filePath
    );
    expect(missingFiles).toEqual([]);

    for (const filePath of SETTINGS_PROFILE_SCOPED_PREFETCH_ROUTES) {
      if (!filePath) {
        throw new Error(
          `Could not find profile-scoped settings source. Checked: ${SETTINGS_PROFILE_SCOPED_PREFETCH_CANDIDATES.join(', ')}`
        );
      }

      const source = readFileSync(filePath, 'utf8');
      expect(source).toContain('getCachedAuth');
      expect(source).toContain('getDashboardShellData');
      expect(source).not.toContain('getDashboardData');
    }
  });
});
