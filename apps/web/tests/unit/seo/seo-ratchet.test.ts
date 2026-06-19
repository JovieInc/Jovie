/**
 * SEO/AEO Ratchet Guardrail (JOV-11044)
 *
 * Ratchet principle: once a route is in ratchet-baseline.json, it can never
 * silently lose required SEO tags. Update the baseline only in intentional PRs.
 */
import { readFileSync } from 'node:fs';
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import {
  loadSeoRatchetBaseline,
  resolveSeoSourcePath,
  validateGenerateMetadataExport,
  validateRouteMetadata,
  validateSourceJsonLd,
  validateSourceMetadataPatterns,
} from '@/lib/seo/ratchet';

const baseline = loadSeoRatchetBaseline();

type RouteModule = {
  metadata?: Metadata;
  generateMetadata?: () => Promise<Metadata>;
};

async function loadRouteMetadata(
  importFn: () => Promise<RouteModule>
): Promise<Metadata | undefined> {
  const mod = await importFn();
  if (mod.metadata) return mod.metadata;
  if (mod.generateMetadata) return mod.generateMetadata();
  return undefined;
}

const ROUTE_IMPORTERS: Record<string, () => Promise<RouteModule>> = {
  '/': () => import('../../../app/(home)/page'),
  '/about': () => import('../../../app/(marketing)/about/page'),
  '/pricing': () => import('../../../app/(marketing)/pricing/layout'),
  '/support': () => import('../../../app/(marketing)/support/page'),
  '/artist-profiles': () =>
    import('../../../app/(marketing)/artist-profiles/page'),
  '/download': () => import('../../../app/(marketing)/download/page'),
  '/blog': () => import('../../../app/(marketing)/blog/page'),
  '/changelog': () => import('../../../app/(marketing)/changelog/page'),
};

describe('SEO ratchet — baseline routes must never lose required tags (JOV-11044)', () => {
  for (const entry of baseline.routes) {
    it(`${entry.path} metadata matches baseline: ${entry.required.join(', ')}`, async () => {
      const importFn = ROUTE_IMPORTERS[entry.path];
      expect(
        importFn,
        `Missing ROUTE_IMPORTERS entry for ${entry.path}`
      ).toBeDefined();

      const metadata = await loadRouteMetadata(importFn!);
      const issues = validateRouteMetadata(
        metadata,
        entry.required,
        entry.path
      );

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });

    it(`${entry.path} source wiring matches baseline`, () => {
      const source = readFileSync(
        resolveSeoSourcePath(entry.sourceFile),
        'utf8'
      );
      const issues = [
        ...validateSourceMetadataPatterns(source, entry.required, entry.path),
        ...(entry.jsonLd ? [validateSourceJsonLd(source, entry.path)] : []),
      ].filter((issue): issue is NonNullable<typeof issue> => issue !== null);

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });
  }
});

describe('SEO ratchet — profile/asset surfaces (JOV-11044)', () => {
  for (const surface of baseline.profileSurfaces) {
    it(`${surface.id} source keeps required SEO/AEO wiring`, () => {
      const source = readFileSync(
        resolveSeoSourcePath(surface.sourceFile),
        'utf8'
      );
      const issues = [
        ...(surface.requireGenerateMetadata
          ? validateGenerateMetadataExport(source, surface.id)
          : surface.required
            ? validateSourceMetadataPatterns(
                source,
                surface.required,
                surface.id
              )
            : []),
        ...(surface.jsonLd ? [validateSourceJsonLd(source, surface.id)] : []),
      ].filter((issue): issue is NonNullable<typeof issue> => issue !== null);

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });
  }
});
