import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/domains';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import type { Release, ReleaseSidebarAnalytics } from './types';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

const release: Release = {
  profileId: 'profile-calvin',
  id: 'release-1',
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

const ready: ReleaseSidebarAnalytics = {
  totalClicks: 1842,
  last7DaysClicks: 126,
  lastClickAt: '2026-08-20T15:04:00.000Z',
  providerClicks: [{ provider: 'spotify', clicks: 940 }],
};

const smartLinkUrl = `${BASE_URL}${release.smartLinkPath}`;

afterEach(() => {
  vi.unstubAllGlobals();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe('ReleaseSmartLinkAnalytics certificate', () => {
  it('shows clicks and copies the smart link, axe-clean', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const { container } = render(
      <ReleaseSmartLinkAnalytics release={release} analyticsOverride={ready} />
    );

    const card = screen.getByTestId('release-smart-link-analytics');
    expect(card).toHaveTextContent('1,842');
    expect(card).toHaveTextContent('Top: Spotify');
    await expectNoA11yViolations(container);

    const control = screen.getByTestId('release-smart-link-control');
    await user.click(
      within(control).getByRole('button', { name: 'Copy smart link' })
    );
    expect(writeText).toHaveBeenCalledWith(smartLinkUrl);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Smart link copied')
    );
    writeText.mockRestore();
  });

  it('opens the smart link in a new tab', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(
      <ReleaseSmartLinkAnalytics release={release} analyticsOverride={ready} />
    );

    await user.click(screen.getByRole('button', { name: 'Open link' }));
    expect(open).toHaveBeenCalledWith(
      smartLinkUrl,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('loads analytics for the release and shows the empty prompt with no clicks', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            totalClicks: 0,
            last7DaysClicks: 0,
            lastClickAt: null,
            providerClicks: [],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <ReleaseSmartLinkAnalytics release={release} />
    );

    expect(
      await screen.findByText(/No clicks yet\. Share your smart link/)
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/releases/release-1/analytics',
      expect.objectContaining({ credentials: 'include' })
    );
    await expectNoA11yViolations(container);
  });

  it('says analytics are unavailable when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    );
    const { container } = render(
      <ReleaseSmartLinkAnalytics release={release} />
    );

    expect(
      await screen.findByText('Analytics unavailable')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds the loading frame while the request is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    const { container } = render(
      <ReleaseSmartLinkAnalytics release={release} />
    );

    expect(screen.queryByText('Analytics unavailable')).toBeNull();
    expect(screen.queryByText(/No clicks yet/)).toBeNull();
    expect(
      screen.getByTestId('release-smart-link-analytics')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
