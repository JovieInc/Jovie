// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { LegacySocialLink } from '@/types/db';
import { SocialLink } from './SocialLink';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  mutate: vi.fn(),
  getSocialDeepLinkConfig: vi.fn(),
  openDeepLink: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/queries', () => ({
  useTrackingMutation: () => ({ mutate: mocks.mutate }),
}));
vi.mock('@/lib/deep-links', () => ({
  getSocialDeepLinkConfig: mocks.getSocialDeepLinkConfig,
  openDeepLink: mocks.openDeepLink,
}));

const createLink = (platform: string, url: string): LegacySocialLink => ({
  id: `link-${platform}`,
  artist_id: 'profile-1',
  platform,
  url,
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
});

describe('SocialLink', () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSocialDeepLinkConfig.mockReturnValue(null);
    open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
  });

  afterEach(() => {
    open.mockRestore();
  });

  it('renders a labelled external link for the platform', async () => {
    const { container } = render(
      <SocialLink
        link={createLink('instagram', 'https://instagram.com/johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
    );

    const link = screen.getByRole('link', {
      name: 'Follow John Doe on Instagram',
    });
    expect(link).toHaveAttribute('href', 'https://instagram.com/johndoe');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('title', 'Follow John Doe on Instagram');
    await expectNoA11yViolations(container);
  });

  it('tracks the click and opens the URL when there is no deep link', async () => {
    const user = userEvent.setup();
    render(
      <SocialLink
        link={createLink('instagram', 'https://instagram.com/johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
    );

    await user.click(
      screen.getByRole('link', { name: 'Follow John Doe on Instagram' })
    );

    expect(mocks.track).toHaveBeenCalledWith('social_click', {
      handle: 'johndoe',
      artist: 'John Doe',
      platform: 'instagram',
      url: 'https://instagram.com/johndoe',
    });
    expect(mocks.mutate).toHaveBeenCalledWith({
      handle: 'johndoe',
      linkType: 'social',
      target: 'instagram',
      linkId: 'link-instagram',
    });
    expect(mocks.getSocialDeepLinkConfig).toHaveBeenCalledWith('instagram');
    expect(mocks.openDeepLink).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      'https://instagram.com/johndoe',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens the native app through the deep link when one exists', async () => {
    const user = userEvent.setup();
    const config = { name: 'Spotify' };
    mocks.getSocialDeepLinkConfig.mockReturnValue(config);
    mocks.openDeepLink.mockResolvedValue(true);
    render(
      <SocialLink
        link={createLink('spotify', 'https://open.spotify.com/artist/jd')}
        handle='johndoe'
        artistName='John Doe'
      />
    );

    await user.click(screen.getByRole('link', { name: /John Doe on Spotify/ }));

    expect(mocks.openDeepLink).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/jd',
      config,
      expect.objectContaining({
        onNativeAttempt: expect.any(Function),
        onFallback: expect.any(Function),
      })
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to opening the URL when the deep link fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.getSocialDeepLinkConfig.mockReturnValue({ name: 'Spotify' });
    mocks.openDeepLink.mockRejectedValue(new Error('no app'));
    render(
      <SocialLink
        link={createLink('spotify', 'https://open.spotify.com/artist/jd')}
        handle='johndoe'
        artistName='John Doe'
      />
    );

    await user.click(screen.getByRole('link', { name: /John Doe on Spotify/ }));

    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/jd',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('renders nothing for a missing URL (empty) or an unsafe one (error)', async () => {
    const { container, rerender } = render(
      <SocialLink
        link={createLink('instagram', '')}
        handle='johndoe'
        artistName='John Doe'
      />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <SocialLink
        link={createLink('spotify', 'javascript:alert(1)')}
        handle='johndoe'
        artistName='John Doe'
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL artist names in the accessible name', async () => {
    const longName =
      'The Extremely Long Named Orchestra and Friends Featuring Special Guests';
    const { container } = render(
      <div dir='rtl'>
        <SocialLink
          link={createLink('instagram', 'https://instagram.com/amr')}
          handle='amr'
          artistName='عمرو دياب'
        />
        <SocialLink
          link={createLink('youtube', 'https://youtube.com/@longname')}
          handle='longname'
          artistName={longName}
        />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'Follow عمرو دياب on Instagram' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: `Follow ${longName} on Youtube` })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
