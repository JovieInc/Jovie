import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VideoReleasePage } from './VideoReleasePage';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => null,
  })
);

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: () => null,
}));

vi.mock('@/features/release/SmartLinkShell', () => ({
  SmartLinkShell: ({
    children,
    heroMeta,
  }: {
    children: ReactNode;
    heroMeta?: ReactNode;
  }) => (
    <div>
      <div data-testid='hero-meta'>{heroMeta}</div>
      {children}
    </div>
  ),
  SMART_LINK_HERO_TITLE_CLASS:
    'text-2xl font-semibold leading-8 tracking-tight text-(--color-text-tooltip)',
  SMART_LINK_HERO_ARTIST_CLASS:
    'mt-1 block text-sm font-book leading-5 text-muted-foreground transition-colors duration-subtle hover:text-foreground',
}));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: () => null,
}));

vi.mock('./YouTubeEmbed', () => ({
  YouTubeEmbed: () => <div data-testid='youtube-embed' />,
}));

describe('VideoReleasePage', () => {
  it('reports the exact smart link page, not a bare slug', () => {
    render(
      <VideoReleasePage
        release={{ title: 'Video', slug: 'video-slug', artworkUrl: null }}
        artist={{
          id: 'artist-1',
          name: 'Test Artist',
          handle: 'test-artist',
          avatarUrl: null,
          ownerUserId: 'user-1',
        }}
        videoId='abc123'
        youtubeUrl='https://www.youtube.com/watch?v=abc123'
      />
    );

    expect(screen.getByRole('link', { name: /Report/ })).toHaveAttribute(
      'href',
      `/report?type=smart_link&target=${encodeURIComponent('/test-artist/video-slug')}`
    );

    const title = screen.getByRole('heading', { name: 'Video' });
    expect(title.tagName).toBe('H1');
    expect(title.className).toContain('text-2xl');
    expect(title.className).not.toContain('text-shadow');
    const artist = screen.getByRole('link', { name: 'Test Artist' });
    expect(artist).toHaveAttribute('href', '/test-artist');
    expect(artist.className).not.toContain('text-shadow');
    const hero = screen.getByTestId('hero-meta');
    expect(hero).toContainElement(title);
    expect(hero).toContainElement(artist);
  });
});
