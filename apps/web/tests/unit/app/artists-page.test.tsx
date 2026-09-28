import { render } from '@testing-library/react';
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

import ArtistsPage from '@/app/artists/page';

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
    mocks.count.mockResolvedValue(1);
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
        total: 1,
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

  it('allows the empty state on the first page only', async () => {
    mocks.count.mockResolvedValue(0);
    mocks.profiles.mockResolvedValue({
      status: 'ok',
      profiles: [],
      nextCursor: null,
    });

    render(await ArtistsPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({ profiles: [], total: 0 })
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
