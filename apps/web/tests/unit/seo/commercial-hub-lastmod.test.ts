import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { getRouteCapability } from '@/data/marketing/featureAvailability';
import {
  commercialHubContentRevision,
  getPublishedCommercialHubPaths,
} from '@/lib/seo/sitemap-publication';

const webRoot = resolve(__dirname, '../../..');

const PRODUCTION_SOURCE_ROOTS = [
  'app',
  'components',
  'lib',
  'data',
  'constants',
];

/** Every non-test production TS/TSX source under the app-facing roots. */
function listProductionSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (
        entry.name.endsWith('.test.ts') ||
        entry.name.endsWith('.test.tsx') ||
        entry.name.endsWith('.stories.tsx')
      ) {
        continue;
      }
      if (full === resolve(webRoot, 'data/companyIdentity.ts')) continue;
      files.push(full);
    }
  };
  for (const root of PRODUCTION_SOURCE_ROOTS) {
    walk(resolve(webRoot, root));
  }
  return files;
}

describe('commercial hub sitemap revisions', () => {
  it('dates unbound commercial roots from cited route-manifest evidence', () => {
    expect(getPublishedCommercialHubPaths()).toEqual(
      expect.arrayContaining(['/', '/pricing'])
    );
    expect(commercialHubContentRevision('/')?.toISOString()).toBe(
      '2026-10-20T00:00:00.000Z'
    );
    expect(commercialHubContentRevision('/pricing')?.toISOString()).toBe(
      '2026-09-29T00:00:00.000Z'
    );
  });

  it('uses the capability content revision for a bound commercial hub', () => {
    const revision = getRouteCapability('/smart-links')?.contentRevision;
    expect(revision).toBe('2026-08-01');
    expect(
      commercialHubContentRevision('/smart-links', revision)?.toISOString()
    ).toBe('2026-08-01T00:00:00.000Z');
  });

  it('leaves pages without a cited revision undated', () => {
    expect(commercialHubContentRevision('/about')).toBeUndefined();
    expect(commercialHubContentRevision('/support')).toBeUndefined();
  });

  it('publishes those revisions from the marketing sitemap loop', () => {
    const source = readFileSync(resolve(webRoot, 'app/sitemap.ts'), 'utf8');
    expect(source).toContain('commercialHubContentRevision');
    expect(source).toContain('getPublishedCommercialHubPaths');
  });
});

describe('public identity metadata', () => {
  it('standardizes the X handle and drops the retired product-category alias', () => {
    expect(COMPANY_IDENTITY.xHandle).toBe('@meetjovie');
    expect(COMPANY_IDENTITY.schemaAlternateNames).toEqual(['Jovie', 'jov.ie']);

    const files = [
      'app/layout.tsx',
      'app/(home)/page.tsx',
      'app/(auth)/signup/layout.tsx',
      'app/[username]/[slug]/page.tsx',
      'app/[username]/[slug]/[trackSlug]/page.tsx',
      'app/r/[slug]/page.tsx',
      'lib/profile/metadata.ts',
      'data/marketing/factory/pageRecordMetadata.ts',
      'app/(marketing)/artist-profile/page.tsx',
      'app/(marketing)/artist-profiles/page.tsx',
      'app/(marketing)/artist-notifications/page.tsx',
      'app/(marketing)/ai/page.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(webRoot, file), 'utf8');
      expect(source, file).not.toContain('@jovieapp');
      expect(source, file).toContain('COMPANY_IDENTITY.xHandle');
    }

    const homepage = readFileSync(
      resolve(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    expect(homepage).not.toContain('Jovie Link in Bio');
    expect(homepage).toContain('COMPANY_IDENTITY.schemaAlternateNames');
  });

  it('bans the retired X handle from every production source', () => {
    for (const file of listProductionSources()) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/@jovieapp|x\.com\/jovieapp/);
    }
  });

  it('sources every literal twitter site/creator handle from COMPANY_IDENTITY.xHandle', () => {
    for (const file of listProductionSources()) {
      const source = readFileSync(file, 'utf8');
      if (!/(site|creator):\s*['"]@[A-Za-z0-9_]+/.test(source)) continue;
      expect(source, file).toContain('COMPANY_IDENTITY.xHandle');
    }
  });
});
