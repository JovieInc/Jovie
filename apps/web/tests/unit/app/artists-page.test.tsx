import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  count: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  directoryProps: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/profile/public-discovery-catalog', () => ({
  loadArtistsDirectoryProfiles: mocks.profiles,
  loadArtistsDirectoryCount: mocks.count,
}));
vi.mock('@/components/organisms/ArtistsDirectory', () => ({
  ArtistsDirectory: (props: unknown) => {
    mocks.directoryProps(props);
    return null;
  },
}));
vi.mock('@/components/organisms/StandaloneProductPage', () => ({
  StandaloneProductPage: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/components/molecules/ContentSectionHeader', () => ({
  ContentSectionHeader: () => null,
}));
vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: () => null,
}));

import ArtistsPage, { generateMetadata } from '@/app/artists/page';

const artist = {
  id: 'id-1',
  username: 'tim',
  displayName: 'Tim White',
  avatarUrl: null,
  bio: 'Artist',
};

describe('/artists page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(12);
  });

  it('renders page 1 normally with the global count', async () => {
    mocks.profiles.mockResolvedValue({
      status: 'ok',
      profiles: [artist],
      nextCursor: null,
    });

    render(await ArtistsPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: [artist],
        total: 12,
        nextCursor: null,
      })
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects an exhausted cursor page back to page 1 (JOV-6939)', async () => {
    mocks.profiles.mockResolvedValue({
      status: 'ok',
      profiles: [],
      nextCursor: null,
    });

    await expect(
      ArtistsPage({ searchParams: Promise.resolve({ cursor: 'abc' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/artists');
    expect(mocks.directoryProps).not.toHaveBeenCalled();
  });

  it('keeps the global total on cursor pages with results', async () => {
    mocks.count.mockResolvedValue(5000);
    mocks.profiles.mockResolvedValue({
      status: 'ok',
      profiles: [artist],
      nextCursor: null,
    });

    render(
      await ArtistsPage({ searchParams: Promise.resolve({ cursor: 'abc' }) })
    );

    expect(mocks.directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({ total: 5000, isFirstPage: false })
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects to /artist-profiles while the directory is below the publish gate', async () => {
    mocks.count.mockResolvedValue(1);
    mocks.profiles.mockResolvedValue({
      status: 'ok',
      profiles: [artist],
      nextCursor: null,
    });

    await expect(
      ArtistsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/artist-profiles');
    expect(mocks.directoryProps).not.toHaveBeenCalled();
  });

  it('renders the no-DB fallback instead of the directory when the catalog is unavailable (JOV-7125)', async () => {
    mocks.profiles.mockResolvedValue({ status: 'unavailable' });

    render(await ArtistsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId('artists-directory')).toBeInTheDocument();
    expect(mocks.directoryProps).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('/artists SEO contract', () => {
  it('canonicalizes page 1 to /artists, not the homepage', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Artists');
    expect(metadata.alternates?.canonical).toBe('/artists');
    expect(metadata.robots).toBeUndefined();
  });

  it('keeps cursor pages out of the index with no canonical', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ cursor: 'abc' }),
    });

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('has no loading boundary, so the publish-gate redirect is a real HTTP redirect', () => {
    // A loading.tsx starts the response as 200 before the page runs, which
    // turns redirect() into a meta refresh on an indexable 200 page.
    expect(existsSync(resolve(process.cwd(), 'app/artists/loading.tsx'))).toBe(
      false
    );
  });
});
