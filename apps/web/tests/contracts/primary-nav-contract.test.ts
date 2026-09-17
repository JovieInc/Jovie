import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_FOR_FLYOUT_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
  MARKETING_TOOLS_FLYOUT_LINKS,
} from '@/data/marketingNavigation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '../..');
const appRoot = join(webRoot, 'app');
const headerSource = readSource('components/site/MarketingHeader.tsx');

function readSource(relativePath: string) {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

function collectActualRoutes() {
  const actualRoutes = new Set<string>();

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (entry.name !== 'page.tsx') continue;

      const routeSegments = relative(appRoot, entryPath)
        .replace(/\/page\.tsx$/u, '')
        .split('/')
        .filter(segment => !segment.startsWith('(') && !segment.startsWith('@'))
        .map(segment => segment.replace(/^\(\.\)/u, ''));
      const route =
        routeSegments.length > 0 ? `/${routeSegments.join('/')}` : '/';
      actualRoutes.add(route);
    }
  }

  visit(appRoot);
  return actualRoutes;
}

const actualRoutes = collectActualRoutes();

function routeFileExistsFor(href: string) {
  if (!href.startsWith('/')) return true;
  return actualRoutes.has(new URL(href, 'https://jovie.local').pathname);
}

describe('primary marketing navigation contract', () => {
  it('labels current destinations without implying a generic product page', () => {
    expect(MARKETING_NAV_LINKS.map(link => link.label)).toEqual([
      'About',
      'For Artists',
      'Pricing',
    ]);
  });

  it('keeps utility links exact and ordered', () => {
    expect(MARKETING_NAV_UTILITIES).toEqual([
      { href: '/signin', label: 'Log in' },
      { href: '/start', label: 'Find yourself' },
    ]);
  });

  it('keeps audience and tools flyouts declared in marketing navigation data', () => {
    expect(MARKETING_FOR_FLYOUT_LINKS.map(link => link.label)).toEqual([
      'Artists',
    ]);
    expect(MARKETING_TOOLS_FLYOUT_LINKS.map(link => link.label)).toEqual([
      'Fan Notifications',
      'Instant Merch',
      'YouTube Thumbnails',
      'CLI',
    ]);
  });

  it('keeps primary, flyout and footer links pointed at concrete pages', () => {
    for (const link of [
      ...MARKETING_NAV_LINKS,
      ...MARKETING_NAV_UTILITIES,
      ...MARKETING_FOR_FLYOUT_LINKS,
      ...MARKETING_TOOLS_FLYOUT_LINKS,
      ...MARKETING_FOOTER_COLUMNS.flatMap(column => column.links),
    ]) {
      expect(routeFileExistsFor(link.href), link.href).toBe(true);
    }
  });

  it('makes MarketingHeader consume the primary nav contract data', () => {
    expect(headerSource).toContain('MARKETING_NAV_LINKS');
    expect(headerSource).toContain('getHomepageFrontDoorCtaContract');
    expect(headerSource).toContain('CANONICAL_PUBLIC_SHELL_EVENTS');
    expect(headerSource).not.toContain('MARKETING_NAV_UTILITIES');
    expect(headerSource).not.toContain('MARKETING_FOR_FLYOUT_LINKS');
    expect(headerSource).not.toContain('MARKETING_TOOLS_FLYOUT_LINKS');
    expect(headerSource).not.toContain("label: 'Features'");
    expect(headerSource).not.toContain("label: 'Resources'");
    expect(headerSource).not.toContain('showContactLink={centerNavEnabled');
  });
});
