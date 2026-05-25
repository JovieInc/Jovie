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

const INTENTIONAL_INTERNAL_ROUTES: Record<string, string> = {
  '/app': 'Shell root entry page',
  '/app/chats': 'Canonical chat index reached from the sidebar link',
  '/app/chat/[id]': 'Thread detail is reached from chat history',
  '/app/library':
    'Canonical library page for releases, merch, images, videos, and audio',
  '/app/threads': 'Legacy all threads route redirects to chats',
  '/app/admin/investors/links': 'Sub-tool reached from Investors workspace',
  '/app/admin/investors/settings':
    'Sub-tool reached from Investors workspace actions',
  '/app/admin/interviews': 'Internal admin review workspace (manual entry)',
  '/app/admin/playlists': 'Internal admin workflow (manual entry)',
  '/app/dashboard/releases/[releaseId]/tasks':
    'Dynamic workflow route reached from releases actions',
  '/app/releases/[releaseId]/tasks':
    'Canonical dynamic workflow route reached from release actions',
  '/app/dashboard/releases/[releaseId]/downloads':
    'Internal release workflow (manual entry)',
  '/app/dashboard/releases':
    'Legacy releases workspace retained for old bookmarks',
  '/app/dashboard/tasks': 'Legacy tasks workspace retained for old bookmarks',
  '/app/settings/retargeting-ads':
    'Legacy settings route redirected to Audience',
  '/app/dashboard/release-plan':
    'Release plan demo page (gated by RELEASE_PLAN_DEMO flag)',
  '/app/insights':
    'AI insights workspace is reachable from dashboard widgets and direct app links until nav placement is finalised',
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
  return (
    /\bredirect\(/.test(source) ||
    /\bpermanentRedirect\(/.test(source) ||
    /\bredirectFromEarningsRoute\(/.test(source)
  );
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
    navItems.map(item => new URL(item.href, 'https://jovie.local').pathname)
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

  it('keeps release task implementation owned by the canonical shell route', () => {
    const canonicalPage = pageByRoute.get('/app/releases/[releaseId]/tasks');
    const legacyPage = pageByRoute.get(
      '/app/dashboard/releases/[releaseId]/tasks'
    );

    expect(canonicalPage?.source).toContain(
      "import { ReleaseTasksRoute } from './ReleaseTasksRoute';"
    );
    expect(legacyPage?.source).toContain(
      '@/app/app/(shell)/releases/[releaseId]/tasks/ReleaseTasksRoute'
    );
  });

  it('keeps release list routes aliased to Library while legacy dashboard keeps matrix ownership', () => {
    const canonicalPage = pageByRoute.get('/app/releases');
    const legacyPage = pageByRoute.get('/app/dashboard/releases');
    const canonicalRoutePath = path.join(
      SHELL_ROOT,
      'releases/ReleasesRoute.tsx'
    );
    const canonicalRouteSource = fs.readFileSync(canonicalRoutePath, 'utf8');

    expect(canonicalPage?.source).toContain('redirect(');
    expect(canonicalPage?.source).toContain('view=releases');
    expect(legacyPage?.source).toContain(
      "import { ReleasesRoute } from '../../releases/ReleasesRoute';"
    );
    expect(canonicalRouteSource).toContain(
      '@/lib/releases/release-matrix-loader'
    );
    expect(canonicalRouteSource).not.toContain(
      'dashboard/releases/release-matrix-loader'
    );
  });
});
