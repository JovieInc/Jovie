import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adminNavigation,
  adminSettingsNavItem,
  adminSettingsNavigation,
  artistSettingsNavigation,
  paymentsNavItem,
  primaryNavigation,
  settingsNavItem,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';

const SHELL_ROOT = path.resolve(__dirname, '../../../app/app/(shell)');

const NAV_ROUTE_PAGE_ALIASES: Record<string, string> = {};

const INTENTIONAL_INTERNAL_ROUTES: Record<string, string> = {
  '/app': 'Shell root entry page',
  '/app/chat/[id]': 'Thread detail is reached from chat history',
  '/app/admin/investors/links': 'Sub-tool reached from Investors workspace',
  '/app/admin/investors/settings':
    'Sub-tool reached from Investors workspace actions',
  '/app/admin/playlists': 'Internal admin workflow (manual entry)',
  '/app/dashboard/releases/[releaseId]/tasks':
    'Dynamic workflow route reached from releases actions',
  '/app/dashboard/releases/[releaseId]/downloads':
    'Internal release workflow (manual entry)',
  '/app/settings/retargeting-ads':
    'Legacy settings route redirected to Audience',
  '/app/dashboard/release-plan':
    'Release plan demo page (gated by RELEASE_PLAN_DEMO flag)',
  '/app/lyrics/[trackId]':
    'Cinematic lyrics surface reached from the AudioBar lyrics button',
};

interface ShellPage {
  readonly filePath: string;
  readonly routePath: string;
  readonly source: string;
}

function toRoutePath(filePath: string): string {
  let relativePath = path.relative(SHELL_ROOT, filePath).replace(/\\/g, '/');
  relativePath = relativePath.replace(/(^|\/)page\.(tsx|ts)$/, '');
  relativePath = relativePath
    .split('/')
    .filter(segment => segment.length > 0)
    .filter(segment => !/^\([^/]+\)$/.test(segment))
    .join('/');

  return `/app${relativePath ? `/${relativePath}` : ''}`;
}

function findShellPages(dir: string = SHELL_ROOT): ShellPage[] {
  const pages: ShellPage[] = [];

  const walk = (currentDir: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && /^page\.(tsx|ts)$/.test(entry.name)) {
        pages.push({
          filePath: fullPath,
          routePath: toRoutePath(fullPath),
          source: fs.readFileSync(fullPath, 'utf8'),
        });
      }
    }
  };

  walk(dir);
  return pages;
}

function isRedirectStub(source: string): boolean {
  return /\bredirect\(/.test(source) || /\bpermanentRedirect\(/.test(source);
}

function getNavRoutePaths(): Set<string> {
  const navItems = [
    ...primaryNavigation,
    settingsNavItem,
    ...userSettingsNavigation,
    paymentsNavItem,
    ...artistSettingsNavigation,
    adminSettingsNavItem,
    ...adminNavigation,
    ...adminSettingsNavigation,
  ];

  return new Set(
    navItems.map(item => NAV_ROUTE_PAGE_ALIASES[item.href] ?? item.href)
  );
}

describe('shell route coverage', () => {
  const pages = findShellPages();
  const pageByRoute = new Map(pages.map(page => [page.routePath, page]));
  const navRoutes = getNavRoutePaths();

  it('every nav destination resolves to a shell page', () => {
    const missingRoutes = [...navRoutes].filter(
      route => !pageByRoute.has(route)
    );

    expect(missingRoutes).toEqual([]);
  });

  it('non-nav shell pages are either intentional internals or explicit redirects', () => {
    const unexpectedPages = pages
      .filter(page => !navRoutes.has(page.routePath))
      .filter(page => !(page.routePath in INTENTIONAL_INTERNAL_ROUTES))
      .filter(page => !isRedirectStub(page.source))
      .map(
        page =>
          `${page.routePath} (${path.relative(SHELL_ROOT, page.filePath)})`
      )
      .sort();

    expect(unexpectedPages).toEqual([]);
  });

  it('intentional internal route allowlist stays accurate', () => {
    const staleAllowlistEntries = Object.keys(INTENTIONAL_INTERNAL_ROUTES)
      .filter(route => !pageByRoute.has(route))
      .sort();

    expect(staleAllowlistEntries).toEqual([]);
  });
});
