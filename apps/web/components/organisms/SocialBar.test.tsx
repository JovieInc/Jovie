import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { openDeepLink } from '@/lib/deep-links';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { LegacySocialLink } from '@/types/db';
import { SocialBar } from './SocialBar';

const mutate = vi.fn();

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/queries', () => ({
  useTrackingMutation: () => ({ mutate }),
}));
vi.mock('@/lib/deep-links', () => ({
  getSocialDeepLinkConfig: () => ({ platform: 'instagram' }),
  openDeepLink: vi.fn(async () => undefined),
}));

const links: LegacySocialLink[] = [
  {
    id: 'l1',
    artist_id: 'artist-1',
    platform: 'instagram',
    url: 'https://instagram.com/jovie',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'l2',
    artist_id: 'artist-1',
    platform: 'tiktok',
    url: 'https://tiktok.com/@jovie',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('SocialBar certificate', () => {
  beforeEach(() => {
    mutate.mockClear();
    vi.mocked(track).mockClear();
    vi.mocked(openDeepLink).mockClear();
  });

  it('renders one named link per social profile axe-clean', async () => {
    const { container } = render(
      <SocialBar handle='jovie' artistName='Jovie' socialLinks={links} />
    );

    expect(
      screen.getByRole('link', { name: 'Follow Jovie on Instagram' })
    ).toHaveAttribute('href', 'https://instagram.com/jovie');
    expect(
      screen.getByRole('link', { name: 'Follow Jovie on Tiktok' })
    ).toHaveAttribute('href', 'https://tiktok.com/@jovie');
    expect(container.firstElementChild).not.toHaveClass('hidden');
    await expectNoA11yViolations(container);
  });

  it('tracks and deep-links the clicked profile', async () => {
    const user = userEvent.setup();
    render(<SocialBar handle='jovie' artistName='Jovie' socialLinks={links} />);

    await user.click(
      screen.getByRole('link', { name: 'Follow Jovie on Instagram' })
    );

    expect(track).toHaveBeenCalledWith('social_click', {
      handle: 'jovie',
      artist: 'Jovie',
      platform: 'instagram',
      url: 'https://instagram.com/jovie',
    });
    expect(mutate).toHaveBeenCalledWith({
      handle: 'jovie',
      linkType: 'social',
      target: 'instagram',
      linkId: 'l1',
    });
    expect(openDeepLink).toHaveBeenCalledWith(
      'https://instagram.com/jovie',
      { platform: 'instagram' },
      expect.any(Object)
    );
  });

  it('hides the bar and renders no links when there are none', async () => {
    const { container } = render(
      <SocialBar handle='jovie' artistName='Jovie' socialLinks={[]} />
    );

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.firstElementChild).toHaveClass('hidden');
    await expectNoA11yViolations(container);
  });
});
