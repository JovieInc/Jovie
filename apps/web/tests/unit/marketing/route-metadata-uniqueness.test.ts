import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { isSitemapIndexableMarketingRoute } from '@/lib/seo/sitemap-publication';

/**
 * Phase 1 marketing guard: every indexable marketing route has its own title
 * and description, and any route that sets its own openGraph or twitter block
 * (which replaces the root layout's wholesale) restates an image. Defects this
 * catches: four pages sharing one description, a duplicate title, and blog
 * author and category pages that shipped without an og:image.
 */
vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: vi.fn().mockResolvedValue(null),
  getProfilesByUsernames: vi.fn().mockResolvedValue([]),
}));

type MetadataModule = {
  metadata?: Metadata;
  generateMetadata?: (props: {
    params: Promise<Record<string, string>>;
    searchParams: Promise<Record<string, string>>;
  }) => Promise<Metadata> | Metadata;
};

function titleOf(metadata: Metadata): string {
  const { title } = metadata;
  if (typeof title === 'string') return title.trim();
  if (title && typeof title === 'object') {
    if ('absolute' in title && typeof title.absolute === 'string') {
      return title.absolute.trim();
    }
    if ('default' in title && typeof title.default === 'string') {
      return title.default.trim();
    }
  }
  return '';
}

function hasImages(value: unknown): boolean {
  const images = (value as { images?: unknown } | undefined)?.images;
  return Array.isArray(images) ? images.length > 0 : Boolean(images);
}

async function loadMetadata(
  glob: string,
  params: Record<string, string> = {}
): Promise<Metadata | null> {
  const mod = (await import(
    /* @vite-ignore */ `@/app/${glob.replace(/\.tsx$/u, '')}`
  )) as MetadataModule;
  if (mod.metadata) return mod.metadata;
  if (mod.generateMetadata) {
    return mod.generateMetadata({
      params: Promise.resolve(params),
      searchParams: Promise.resolve({}),
    });
  }
  return null;
}

const indexableStaticRoutes = MARKETING_ROUTE_MANIFEST.filter(
  entry =>
    isSitemapIndexableMarketingRoute(entry) &&
    !entry.url.includes('*') &&
    !entry.glob.includes('[')
);

describe('indexable marketing routes have unique, complete metadata', {
  timeout: 120_000,
}, () => {
  it('covers a meaningful set of routes', () => {
    expect(indexableStaticRoutes.length).toBeGreaterThanOrEqual(12);
  });

  it('gives every indexable route its own title and description', async () => {
    const titles = new Map<string, string[]>();
    const descriptions = new Map<string, string[]>();
    const missing: string[] = [];

    for (const entry of indexableStaticRoutes) {
      const metadata = await loadMetadata(entry.glob);
      if (!metadata) {
        missing.push(`${entry.url}: page exports no metadata`);
        continue;
      }
      const title = titleOf(metadata);
      const description =
        typeof metadata.description === 'string'
          ? metadata.description.trim()
          : '';
      if (!title) missing.push(`${entry.url}: empty title`);
      if (!description) missing.push(`${entry.url}: empty description`);
      if (title) titles.set(title, [...(titles.get(title) ?? []), entry.url]);
      if (description) {
        descriptions.set(description, [
          ...(descriptions.get(description) ?? []),
          entry.url,
        ]);
      }
    }

    const duplicates = [
      ...[...titles].filter(([, urls]) => urls.length > 1),
      ...[...descriptions].filter(([, urls]) => urls.length > 1),
    ].map(([text, urls]) => `${urls.join(', ')} share: ${text.slice(0, 80)}`);
    expect([...missing, ...duplicates]).toEqual([]);
  });

  it('restates an image wherever a route sets its own openGraph or twitter', async () => {
    const offenders: string[] = [];
    for (const entry of indexableStaticRoutes) {
      const metadata = await loadMetadata(entry.glob);
      if (!metadata) continue;
      if (metadata.openGraph && !hasImages(metadata.openGraph)) {
        offenders.push(`${entry.url}: openGraph without images`);
      }
      if (metadata.twitter && !hasImages(metadata.twitter)) {
        offenders.push(`${entry.url}: twitter without images`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps an og:image on blog author and category pages', async () => {
    const author = await loadMetadata(
      '(marketing)/blog/authors/[username]/page',
      {
        username: 'tim',
      }
    );
    const category = await loadMetadata(
      '(marketing)/blog/category/[slug]/page',
      {
        slug: 'music-business',
      }
    );
    for (const [name, metadata] of [
      ['author', author],
      ['category', category],
    ] as const) {
      expect(metadata?.openGraph, name).toBeDefined();
      expect(hasImages(metadata?.openGraph), `${name} og:image`).toBe(true);
      expect(hasImages(metadata?.twitter), `${name} twitter image`).toBe(true);
    }
  });
});
