import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
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
  return actualRoutes.has(href);
}

describe('primary marketing navigation contract', () => {
  it('keeps the top-level marketing nav labels exact and ordered', () => {
    expect(MARKETING_NAV_LINKS.map(link => link.label)).toEqual([
      'Customers',
      'Product',
      'Pricing',
    ]);
  });

  it('keeps utility links exact and ordered', () => {
    expect(MARKETING_NAV_UTILITIES).toEqual([
      { href: '/signin', label: 'Log in' },
      { href: '/start', label: 'Get started' },
    ]);
  });

  it('keeps every primary nav link pointed at a route the app can serve', () => {
    for (const link of [...MARKETING_NAV_LINKS, ...MARKETING_NAV_UTILITIES]) {
      expect(routeFileExistsFor(link.href), link.href).toBe(true);
    }
  });

  it('makes MarketingHeader consume the primary nav contract data', () => {
    for (const exportName of [
      'MARKETING_NAV_LINKS',
      'MARKETING_NAV_UTILITIES',
    ]) {
      expect(headerSource).toContain(exportName);
    }

    expect(headerSource).not.toContain("label: 'Features'");
    expect(headerSource).not.toContain("label: 'Resources'");
    expect(headerSource).not.toContain('showContactLink={centerNavEnabled');
  });
});
