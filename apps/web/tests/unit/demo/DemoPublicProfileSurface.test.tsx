import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileIdentityHeader } from '@/features/profile/ProfileIdentityHeader';
import { resolveProfileSurfaceState } from '@/features/profile/profile-surface-state';
import type { StaticArtistPageProps } from '@/features/profile/StaticArtistPage';

const mockStaticArtistPage = vi.hoisted(() => vi.fn());

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: unknown) => {
    mockStaticArtistPage(props);
    return <div data-testid='static-artist-page' />;
  },
}));

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('DemoPublicProfileSurface', () => {
  beforeEach(() => {
    mockStaticArtistPage.mockClear();
  });

  it('passes a Venmo social link to the demo public profile surface', async () => {
    const { DemoPublicProfileSurface } = await import(
      '@/features/demo/DemoPublicProfileSurface'
    );

    render(<DemoPublicProfileSurface />);

    expect(mockStaticArtistPage).toHaveBeenCalledTimes(1);
    expect(mockStaticArtistPage).toHaveBeenCalledWith(
      expect.objectContaining({
        socialLinks: expect.arrayContaining([
          expect.objectContaining({
            platform: 'venmo',
            url: 'https://venmo.com/calvin-demo',
          }),
        ]),
      })
    );
  });

  it('intentionally renders initials for the default no-photo compact fixture', async () => {
    const { DemoPublicProfileSurface } = await import(
      '@/features/demo/DemoPublicProfileSurface'
    );
    render(<DemoPublicProfileSurface />);
    const props = mockStaticArtistPage.mock
      .calls[0]?.[0] as StaticArtistPageProps;
    expect(props.presentation).toBe('compact-preview');
    const state = resolveProfileSurfaceState({
      artist: props.artist,
      socialLinks: props.socialLinks,
      hasPlayableDestinations: true,
      activeSubtitle: 'Artist profile',
    });
    expect(state.heroImageUrl).toBeNull();

    render(
      <ProfileIdentityHeader
        name={props.artist.name}
        handle={props.artist.handle}
        imageUrl={state.heroImageUrl}
        profileHref={`/${props.artist.handle}`}
        listenHref={`/${props.artist.handle}/listen`}
      />
    );
    const portrait = screen.getByTestId('profile-identity-portrait');
    expect(portrait).toHaveTextContent('CH');
    expect(portrait.querySelector('img')).toBeNull();
  });
});
