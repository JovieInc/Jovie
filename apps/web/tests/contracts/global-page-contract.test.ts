import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getMarketingPageContractForRouteGlob,
  MARKETING_PAGE_CONTRACT_ROUTE_GLOBS,
  MARKETING_PAGE_CONTRACTS,
} from '@/data/marketing/pageContracts';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '../..');
const appRoot = join(webRoot, 'app');
const publicShellSource = readSource('components/site/PublicPageShell.tsx');
const markerSource = readSource(
  'components/site/MarketingPageContractMarkers.tsx'
);

function readSource(relativePath: string) {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

function collectPageGlobs(): readonly string[] {
  const pageGlobs: string[] = [];

  function visit(directory: string) {
    for (const entry of readdirSync(directory)) {
      const entryPath = join(directory, entry);
      const stats = statSync(entryPath);

      if (stats.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (entry === 'page.tsx') {
        pageGlobs.push(relative(appRoot, entryPath));
      }
    }
  }

  for (const routeRoot of ['(home)', '(marketing)', 'waitlist']) {
    visit(join(appRoot, routeRoot));
  }
  return pageGlobs.sort();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function countJsxAttributes(source: string, attributeName: string) {
  const attributePattern = new RegExp(
    `<[A-Za-z][^>]*\\s${escapeRegExp(attributeName)}(?:\\s|=|>|/)`,
    'gu'
  );
  return Array.from(source.matchAll(attributePattern)).length;
}

describe('global marketing page contract', () => {
  it('keeps every marketing page file declared in the route manifest', () => {
    const actualPageGlobs = collectPageGlobs();
    const manifestGlobs = MARKETING_ROUTE_MANIFEST.map(entry => entry.glob)
      .slice()
      .sort();

    expect(manifestGlobs).toEqual(actualPageGlobs);
  });

  it('requires a page contract for every non-exempt manifest route', () => {
    const nonExemptRoutes = MARKETING_ROUTE_MANIFEST.filter(
      entry => entry.exempt === undefined
    );

    expect([...MARKETING_PAGE_CONTRACT_ROUTE_GLOBS].sort()).toEqual(
      nonExemptRoutes.map(entry => entry.glob).sort()
    );

    for (const entry of nonExemptRoutes) {
      const contract = getMarketingPageContractForRouteGlob(entry.glob);
      expect(contract, entry.glob).toBeDefined();
      expect(contract?.routeGlob).toBe(entry.glob);
      expect(contract?.url).toBe(entry.url);
      expect(contract?.job.trim(), `${entry.glob} job`).toBeTruthy();
      expect(contract?.proof.trim(), `${entry.glob} proof`).toBeTruthy();
      expect(
        contract?.successEvent.trim(),
        `${entry.glob} success event`
      ).toBeTruthy();
      expect(
        contract?.primaryCta.href.trim(),
        `${entry.glob} CTA href`
      ).toMatch(/^(\/|https:\/\/)/u);
      expect(contract?.primaryCta.label.trim(), `${entry.glob} CTA label`).toBe(
        contract?.primaryCta.label
      );
    }
  });

  it('mounts contract markers from every shared marketing shell route', () => {
    expect(publicShellSource).toContain('MarketingPageContractMarkers');
    expect(publicShellSource).toContain('<MarketingPageContractMarkers />');

    for (const layoutPath of [
      'app/(home)/layout.tsx',
      'app/(marketing)/layout.tsx',
    ]) {
      const source = readSource(layoutPath);
      expect(source, layoutPath).toContain('PublicPageShell');
    }

    const waitlistSource = readSource('app/waitlist/page.tsx');
    expect(waitlistSource).toContain('MarketingPageContractMarkers');
    expect(waitlistSource).toContain('WaitlistRouteWithContract');
  });

  it('renders one hidden primary CTA marker and required page metadata markers', () => {
    const markerPath = join(
      webRoot,
      'components/site/MarketingPageContractMarkers.tsx'
    );

    expect(existsSync(markerPath)).toBe(true);
    expect(countJsxAttributes(markerSource, 'data-primary-cta')).toBe(1);
    expect(countJsxAttributes(markerSource, 'data-page-job')).toBe(1);
    expect(countJsxAttributes(markerSource, 'data-proof')).toBe(1);
    expect(countJsxAttributes(markerSource, 'data-success-event')).toBe(1);
    expect(markerSource).toContain('hidden');
  });

  it('counts only exact JSX attributes, not comments or longer attribute names', () => {
    const source = [
      '/* data-primary-cta */',
      '<div data-primary-cta-label="ignored" />',
      '<a href="/start" data-primary-cta="true">Find yourself</a>',
    ].join('\n');

    expect(countJsxAttributes(source, 'data-primary-cta')).toBe(1);
  });

  it('keeps page contract declarations keyed by their own route glob', () => {
    for (const [glob, contract] of Object.entries(MARKETING_PAGE_CONTRACTS)) {
      expect(contract.routeGlob).toBe(glob);
    }
  });
});
