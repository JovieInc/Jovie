import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/app';
import {
  DEFAULT_OG_IMAGE_URL,
  defaultOpenGraphImages,
  defaultTwitterImages,
} from '@/lib/seo/default-og-image';

const posts = vi.hoisted(() => [
  {
    slug: 'a',
    title: 'A',
    category: 'Product',
    author: 'Tim White',
    authorUsername: 'tim',
  },
]);

vi.mock('@/lib/blog/getBlogPosts', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/blog/getBlogPosts')>()),
  getBlogPosts: vi.fn().mockResolvedValue(posts),
}));
vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: vi.fn().mockResolvedValue(null),
  getProfilesByUsernames: vi.fn().mockResolvedValue([]),
}));

import { generateMetadata as authorMetadata } from '@/app/(marketing)/blog/authors/[username]/page';
import { generateMetadata as categoryMetadata } from '@/app/(marketing)/blog/category/[slug]/page';

describe('default Open Graph image helpers', () => {
  it('points at the site-wide card with the standard 1200x630 size', () => {
    expect(DEFAULT_OG_IMAGE_URL).toBe(`${BASE_URL}/og/default.png`);
    expect(defaultOpenGraphImages('Alt text')).toEqual([
      { url: DEFAULT_OG_IMAGE_URL, width: 1200, height: 630, alt: 'Alt text' },
    ]);
    expect(defaultTwitterImages()).toEqual([DEFAULT_OG_IMAGE_URL]);
  });
});

describe('blog author and category metadata restate an og:image', () => {
  beforeEach(() => vi.clearAllMocks());

  it('author pages carry the default card for open graph and twitter', async () => {
    const meta = await authorMetadata({
      params: Promise.resolve({ username: 'tim' }),
    });
    expect(meta).toMatchObject({
      openGraph: {
        images: [
          { url: DEFAULT_OG_IMAGE_URL, alt: 'Tim White on the Jovie blog' },
        ],
      },
      twitter: { card: 'summary_large_image', images: [DEFAULT_OG_IMAGE_URL] },
    });
  });

  it('author pages without posts keep the bare fallback title', async () => {
    const meta = await authorMetadata({
      params: Promise.resolve({ username: 'nobody' }),
    });
    expect(meta).toEqual({ title: 'Author' });
  });

  it('category pages carry the default card for open graph and twitter', async () => {
    const meta = await categoryMetadata({
      params: Promise.resolve({ slug: 'product' }),
    });
    expect(meta).toMatchObject({
      openGraph: { images: [{ url: DEFAULT_OG_IMAGE_URL, width: 1200 }] },
      twitter: { card: 'summary_large_image', images: [DEFAULT_OG_IMAGE_URL] },
    });
  });
});
