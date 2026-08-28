import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROFILE_URL } from '@/constants/domains';
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

describe('ReleaseSmartLinkAnalytics', () => {
  it('renders the production profile host in the smart link, never a loopback URL', () => {
    const profileHost = new URL(PROFILE_URL).host;

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
});
