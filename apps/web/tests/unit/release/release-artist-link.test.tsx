import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnreleasedReleaseHero } from '@/components/release/UnreleasedReleaseHero';
import { ReleaseLandingPage } from '../../../app/r/[slug]/ReleaseLandingPage';

type LinkProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly [key: string]: unknown;
};

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string; src: string }) => (
    <img alt={props.alt ?? ''} {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/components/profile/artist-notifications-cta', () => ({
  ArtistNotificationsCTA: () => <div data-testid='artist-cta' />,
}));

vi.mock(
  '@/components/organisms/hooks/useProfileNotificationsController',
  () => ({
    useProfileNotificationsController: () => ({
      channel: 'email',
      hasStoredContacts: false,
      hydrationStatus: 'hydrated',
      openSubscription: vi.fn(),
      registerInputFocus: vi.fn(),
      setChannel: vi.fn(),
      setState: vi.fn(),
      setSubscribedChannels: vi.fn(),
      setSubscriptionDetails: vi.fn(),
      state: 'idle',
      subscribedChannels: {},
      subscriptionDetails: {},
    }),
  })
);

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('release artist links', () => {
  it('renders artist name as link on release landing page when handle exists', () => {
    render(
      <ReleaseLandingPage
        release={{
          title: 'Test Release',
          artworkUrl: null,
          releaseDate: '2026-01-10',
        }}
        artist={{
          name: 'Test Artist',
          handle: 'test-artist',
          avatarUrl: null,
        }}
        providers={[
          {
            key: 'spotify',
            label: 'Spotify',
            accent: '#1DB954',
            url: 'https://open.spotify.com',
          },
        ]}
      />
    );

    const artistLink = screen.getByRole('link', { name: 'Test Artist' });
    expect(artistLink).toHaveAttribute('href', '/test-artist');
  });

  it('renders artist name as text on release landing page when handle is missing', () => {
    render(
      <ReleaseLandingPage
        release={{
          title: 'Test Release',
          artworkUrl: null,
          releaseDate: '2026-01-10',
        }}
        artist={{
          name: 'Test Artist',
          handle: null,
          avatarUrl: null,
        }}
        providers={[]}
      />
    );

    expect(
      screen.queryByRole('link', { name: 'Test Artist' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('links artist name in unreleased hero to artist profile', () => {
    render(
      <UnreleasedReleaseHero
        release={{
          title: 'Future Release',
          artworkUrl: null,
          releaseDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
        }}
        artist={{
          id: 'artist-1',
          name: 'Test Artist',
          handle: 'test-artist',
          avatarUrl: null,
        }}
      />
    );

    const artistLink = screen.getByRole('link', { name: 'Test Artist' });
    expect(artistLink).toHaveAttribute('href', '/test-artist');
  });
});
