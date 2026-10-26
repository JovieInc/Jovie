import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unstableCache, artistPage } = vi.hoisted(() => ({
  unstableCache: vi.fn(
    (fn: () => Promise<unknown>, _key: string[], _opts: { tags: string[] }) =>
      fn
  ),
  artistPage: vi.fn(async () => null),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ unstable_cache: unstableCache }));
vi.mock('@/app/[username]/page', () => ({
  default: artistPage,
  generateMetadata: vi.fn(async () => ({
    title: 't',
    robots: { index: true },
  })),
}));

import ProfileVariantRenderPage, { generateMetadata } from './page';

describe('profile variant render route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tags the render with the profile cache tag so revalidateTag covers it', async () => {
    await ProfileVariantRenderPage({
      params: Promise.resolve({
        username: 'TimWhite',
        variant: 'dn-DE',
        marker: '__profile-variant',
      }),
    });
    expect(unstableCache.mock.calls[0]?.[2].tags).toEqual(['profile:timwhite']);
    expect(artistPage).toHaveBeenCalledOnce();
  });

  it('404s on a wrong marker or an unknown variant key', async () => {
    for (const [variant, marker] of [
      ['dn-DE', 'x'],
      ['zz-DE', '__profile-variant'],
      ['dn-US/../../x', '__profile-variant'],
    ] as const) {
      await expect(
        ProfileVariantRenderPage({
          params: Promise.resolve({ username: 'tim', variant, marker }),
        })
      ).rejects.toThrow();
    }
    expect(artistPage).not.toHaveBeenCalled();
  });

  it('keeps canonical, indexable metadata', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({
        username: 'tim',
        variant: 'dn-DE',
        marker: '__profile-variant',
      }),
    });
    expect(meta.robots).toEqual({ index: true });
  });
});
