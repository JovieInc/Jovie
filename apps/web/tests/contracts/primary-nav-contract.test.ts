import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getRoutedSolutionsPages } from '@/content/pages/solutions';
import { pageRecordPath } from '@/data/marketing/factory/pageRecord';
import {
  MARKETING_CUSTOMERS_FLYOUT,
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

function routeFileExistsFor(href: string) {
  if (!href.startsWith('/')) return true;

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
  // Record-backed family routes serve each routed record's path (JOV-7275).
  const recordRoutes = new Set(getRoutedSolutionsPages().map(pageRecordPath));
  return (
    actualRoutes.has(href) ||
    (recordRoutes.has(href) && actualRoutes.has('/solutions/[audience]'))
  );
}

describe('primary marketing navigation contract', () => {
  it('keeps the top-level marketing nav labels exact and ordered', () => {
    // Canonical Pen header (2026-09-26): Customers flyout, Product, Pricing.
    expect(MARKETING_NAV_LINKS).toEqual([
      { href: '/product', label: 'Product' },
      { href: '/pricing', label: 'Pricing' },
    ]);
  });

  it('keeps utility links exact and ordered', () => {
    expect(MARKETING_NAV_UTILITIES).toEqual([
      { href: '/signin', label: 'Log in' },
      { href: '/start', label: 'Find yourself' },
    ]);
  });

  it('keeps the Customers flyout and tools declared in marketing navigation data', () => {
    // Only audiences with their own landing page. Founders, Authors, and
    // Creators are omitted until their pages ship; never link a stand-in.
    expect(MARKETING_CUSTOMERS_FLYOUT).toEqual({
      id: 'customers',
      label: 'Customers',
      heading: 'Customers',
      links: [{ href: '/solutions/artists', label: 'Artists' }],
    });
    const destinations = MARKETING_CUSTOMERS_FLYOUT.links.map(
      link => link.href
    );
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(MARKETING_TOOLS_FLYOUT_LINKS.map(link => link.label)).toEqual([
      'Music Smart Links',
      'Fan Notifications',
      'Instant Merch',
      'CLI',
    ]);
  });

  it('keeps every primary nav link pointed at a route the app can serve', () => {
    for (const link of [
      ...MARKETING_NAV_LINKS,
      ...MARKETING_NAV_UTILITIES,
      ...MARKETING_CUSTOMERS_FLYOUT.links,
      ...MARKETING_TOOLS_FLYOUT_LINKS,
    ]) {
      expect(routeFileExistsFor(link.href), link.href).toBe(true);
    }
  });

  it('makes MarketingHeader consume the primary nav contract data', () => {
    expect(headerSource).toContain('MARKETING_NAV_LINKS');
    expect(headerSource).toContain('getHomepageFrontDoorCtaContract');
    expect(headerSource).toContain('CANONICAL_PUBLIC_SHELL_EVENTS');
    expect(headerSource).not.toContain('MARKETING_NAV_UTILITIES');
    expect(headerSource).toContain('MARKETING_CUSTOMERS_FLYOUT');
    expect(headerSource).not.toContain('MARKETING_TOOLS_FLYOUT_LINKS');
    expect(headerSource).not.toContain("label: 'Features'");
    expect(headerSource).not.toContain("label: 'Resources'");
    expect(headerSource).not.toContain('showContactLink={centerNavEnabled');
  });
});
