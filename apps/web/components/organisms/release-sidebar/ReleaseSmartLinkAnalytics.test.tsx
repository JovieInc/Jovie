import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/domains';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import type { Release } from './types';

const mockRelease: Release = {
  profileId: 'profile-calvin',
  id: 'release-im-not-alone-remixes',
  title: "I'm Not Alone Remixes",
  artistNames: ['Calvin Harris'],
  status: 'released',
  slug: 'im-not-alone-remixes',
  smartLinkPath: '/calvinharris/im-not-alone-remixes',
  providers: [],
  releaseType: 'ep',
  isExplicit: false,
  totalTracks: 4,
  totalDiscs: 1,
};

/** Any formatTimeAgo output — relative labels must never reach server HTML. */
const RELATIVE_TEXT = /(?:just now)|(?:\d+\s?(?:m|h|d|w|mo|y)\s?ago)/u;

describe('ReleaseSmartLinkAnalytics', () => {
  it('renders the production profile host in the smart link, never a loopback URL', () => {
    const profileHost = new URL(BASE_URL).host;

    render(
      <ReleaseSmartLinkAnalytics
        release={mockRelease}
        artistName='Calvin Harris'
        analyticsOverride={{
          totalClicks: 12,
          last7DaysClicks: 3,
          lastClickAt: '2026-08-20T15:04:00.000Z',
          providerClicks: [{ provider: 'spotify', clicks: 8 }],
        }}
      />
    );

    const control = screen.getByTestId('release-smart-link-control');
    expect(control).toHaveTextContent(profileHost);
    expect(control).toHaveTextContent('calvinharris/im-not-alone-remixes');
    expect(control.textContent ?? '').not.toMatch(/localhost|127\.0\.0\.1/u);
  });

  it('names the copy control as the smart link, matching every other release surface', () => {
    render(
      <ReleaseSmartLinkAnalytics
        release={mockRelease}
        artistName='Calvin Harris'
      />
    );

    const control = screen.getByTestId('release-smart-link-control');
    expect(
      within(control).getByRole('button', { name: 'Copy smart link' })
    ).toHaveAttribute('title', 'Copy smart link');
  });

  it('server-renders a wall-clock-independent last-click value so hydration cannot mismatch', () => {
    const html = renderToString(
      <ReleaseSmartLinkAnalytics
        release={mockRelease}
        artistName='Calvin Harris'
        analyticsOverride={{
          totalClicks: 12,
          last7DaysClicks: 3,
          lastClickAt: '2026-08-20T15:04:00.000Z',
          providerClicks: [{ provider: 'spotify', clicks: 8 }],
        }}
      />
    );

    expect(html).toContain('Aug 20, 2026');
    expect(html).not.toMatch(RELATIVE_TEXT);
  });

  it('upgrades the last-click value to relative time once hydrated', () => {
    render(
      <ReleaseSmartLinkAnalytics
        release={mockRelease}
        artistName='Calvin Harris'
        analyticsOverride={{
          totalClicks: 12,
          last7DaysClicks: 3,
          lastClickAt: '2026-08-20T15:04:00.000Z',
          providerClicks: [{ provider: 'spotify', clicks: 8 }],
        }}
      />
    );

    expect(
      screen.getByTestId('drawer-analytics-metric-value-last-click')
    ).toHaveTextContent(RELATIVE_TEXT);
  });
});
