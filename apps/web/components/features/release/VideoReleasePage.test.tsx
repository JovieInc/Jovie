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
  SmartLinkShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
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
  });
});
