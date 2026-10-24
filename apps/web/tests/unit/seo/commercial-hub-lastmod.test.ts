import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { getRouteCapability } from '@/data/marketing/featureAvailability';
import {
  commercialHubContentRevision,
  getPublishedCommercialHubPaths,
} from '@/lib/seo/sitemap-publication';

const webRoot = resolve(__dirname, '../../..');

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

  it('dates the remaining unbound commercial pages from cited revisions', () => {
    for (const path of [
      '/about',
      '/support',
      '/developers',
      '/api-versioning',
      '/compare',
      '/alternatives',
      '/integrations',
      '/product/link-analytics',
      '/product/utm-links',
      '/product/command-palette',
      '/product/release-scheduling',
      '/product/dsp-links',
      '/product/isrc',
      '/product/pre-save',
    ]) {
      expect(commercialHubContentRevision(path)?.toISOString()).toBe(
        '2026-10-23T00:00:00.000Z'
      );
    }
  });

  it('leaves pages without a cited revision undated', () => {
    expect(commercialHubContentRevision('/no-such-page')).toBeUndefined();
  });

  it('dates every published commercial hub (JOV-8567)', () => {
    const undated = getPublishedCommercialHubPaths().filter(
      path =>
        commercialHubContentRevision(
          path,
          getRouteCapability(path)?.contentRevision
        ) === undefined
    );

    expect(undated).toEqual([]);
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
});
