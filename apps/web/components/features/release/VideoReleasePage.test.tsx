import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VideoReleasePage } from './VideoReleasePage';

const { postJsonBeacon } = vi.hoisted(() => ({ postJsonBeacon: vi.fn() }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon }));

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
  ProfileDrawerShell: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role='dialog' aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/features/release/SmartLinkShell', () => ({
  SmartLinkShell: ({
    children,
    heroMeta,
    onMenuOpen,
  }: {
    children: ReactNode;
    heroMeta?: ReactNode;
    onMenuOpen?: () => void;
  }) => (
    <main>
      <button type='button' onClick={onMenuOpen}>
        Menu
      </button>
      <div data-testid='hero-meta'>{heroMeta}</div>
      {children}
    </main>
  ),
  SMART_LINK_HERO_TITLE_CLASS:
    'text-2xl font-semibold leading-8 tracking-tight text-(--color-text-tooltip)',
  SMART_LINK_HERO_ARTIST_CLASS:
    'mt-1 block text-sm font-book leading-5 text-muted-foreground transition-colors duration-subtle hover:text-foreground',
}));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: ({ context }: { context: { url?: string } }) => (
    <p>Share {context.url}</p>
  ),
}));

// The embed is stubbed: no YouTube frame or third-party content in tests.
vi.mock('./YouTubeEmbed', () => ({
  YouTubeEmbed: ({
    title,
    onError,
  }: {
    title: string;
    onError?: () => void;
  }) => (
    <div data-testid='youtube-embed' title={title}>
      <button type='button' onClick={onError}>
        Fail embed
      </button>
    </div>
  ),
}));

const RELEASE = {
  title: 'The Deep End (Official Video)',
  slug: 'the-deep-end',
  artworkUrl: '/art.jpg',
};
const ARTIST = {
  id: 'artist-1',
  name: 'Tim White',
  handle: 'tim',
  avatarUrl: null,
  ownerUserId: 'user-1',
};
const renderPage = (
  release: { title: string; slug: string; artworkUrl: string | null } = RELEASE,
  artist = ARTIST
) =>
  render(
    <VideoReleasePage
      release={release}
      artist={artist}
      videoId='abc123'
      youtubeUrl='https://www.youtube.com/watch?v=abc123'
    />
  );

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

  it('opens the share drawer from the menu and links out to YouTube, without axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    const watch = screen.getByRole('link', {
      name: 'Watch On YouTube (Opens In New Tab)',
    });
    expect(watch).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc123'
    );
    expect(watch).toHaveAttribute('rel', 'noopener noreferrer');
    // /40 on the near-black stage measures 3.68:1 — below AA for 12px copy.
    expect(watch).toHaveClass('text-on-media/60', 'hover:text-on-media/80');
    expect(screen.getByTestId('youtube-embed')).toHaveAttribute(
      'title',
      'Music video: The Deep End (Official Video) by Tim White'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog', { name: 'Share' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders without artwork (empty) without axe violations', async () => {
    const { container } = renderPage({ ...RELEASE, artworkUrl: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'The Deep End (Official Video)'
    );
    await expectNoA11yViolations(container);
  });

  it('wraps a long title and artist without axe violations', async () => {
    const title =
      'The Deep End (Official Video) [Extended Directors Cut featuring The Midnight Strings Orchestra]';
    const { container } = renderPage(
      { ...RELEASE, title },
      { ...ARTIST, name: 'Tim White and The Midnight Strings Orchestra' }
    );
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left page without axe violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <VideoReleasePage
          release={{ ...RELEASE, title: 'النهاية العميقة' }}
          artist={{ ...ARTIST, name: 'تيم وايت' }}
          videoId='abc123'
          youtubeUrl='https://www.youtube.com/watch?v=abc123'
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'النهاية العميقة' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  describe('when the embed fails', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      postJsonBeacon.mockClear();
    });

    it('reports the failure and sends the fan to the artist profile instead of a dead page', async () => {
      const user = userEvent.setup();
      const replace = vi.fn();
      vi.stubGlobal('location', { replace, href: 'http://localhost/tim/v' });
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Fail embed' }));
      expect(postJsonBeacon).toHaveBeenCalledWith(
        '/api/track',
        expect.objectContaining({
          handle: 'tim',
          linkType: 'error',
          target: 'video_embed_failed',
          context: {
            videoId: 'abc123',
            releaseSlug: 'the-deep-end',
            creatorProfileId: 'artist-1',
          },
        }),
        expect.any(Function)
      );
      expect(replace).toHaveBeenCalledWith('/tim');
    });
  });
});
