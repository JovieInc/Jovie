import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const { error, fetchMock, push, refresh, success } = vi.hoisted(() => ({
  error: vi.fn(),
  fetchMock: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/components/feedback', () => ({
  toast: { error, success },
}));
vi.mock('@/components/features/dashboard/organisms/SettingsSection', () => ({
  SettingsSection: ({ children }: { readonly children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@/components/molecules/settings/SettingsPanel', () => ({
  SettingsPanel: ({ children }: { readonly children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

import { ConnectorsClient } from './ConnectorsClient';

const disconnectedConnectors = {
  gmail: { status: 'not_connected' as const },
  google_calendar: { status: 'not_connected' as const },
  spotify: { status: 'not_connected' as const },
  youtube: { status: 'not_connected' as const },
};

function youtubeRow() {
  const status = screen.getByRole('status', {
    name: /YouTube status:/,
  });
  const row = status.closest<HTMLElement>('[data-status]');
  if (!row) throw new Error('YouTube connector row was not rendered');
  return within(row);
}

describe('ConnectorsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  it('lists every registered provider and shows connected YouTube scopes', () => {
    render(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          youtube: {
            status: 'connected',
            accountLabel: 'Artist Channel',
            scopes: YOUTUBE_OAUTH_SCOPES,
          },
        }}
        creatorProfileId='22222222-2222-4222-8222-222222222222'
        suggestedActions={[]}
        isDev={false}
      />
    );

    for (const provider of ['Gmail', 'Google Calendar', 'Spotify', 'YouTube']) {
      expect(screen.getByText(provider)).toBeInTheDocument();
    }
    expect(youtubeRow().getByText('Artist Channel')).toBeInTheDocument();
    expect(
      youtubeRow().getByRole('list', { name: 'YouTube granted scopes' })
    ).toHaveTextContent(
      'Read Channel Data, Manage Videos, View Channel Analytics, Post Approved Replies'
    );
  });

  it('starts YouTube OAuth and disconnects the selected creator profile', async () => {
    const user = userEvent.setup();
    const creatorProfileId = '22222222-2222-4222-8222-222222222222';
    const { rerender } = render(
      <ConnectorsClient
        connectors={disconnectedConnectors}
        creatorProfileId={creatorProfileId}
        suggestedActions={[]}
        isDev={false}
      />
    );

    await user.click(youtubeRow().getByRole('button', { name: 'Connect' }));
    expect(push).toHaveBeenCalledWith(
      `/api/connectors/youtube/authorize?returnTo=${encodeURIComponent(APP_ROUTES.SETTINGS_CONNECTORS)}&creatorProfileId=${creatorProfileId}`
    );

    rerender(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          youtube: { status: 'connected' },
        }}
        creatorProfileId={creatorProfileId}
        suggestedActions={[]}
        isDev={false}
      />
    );
    await user.click(youtubeRow().getByRole('button', { name: 'Disconnect' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/connectors/youtube/disconnect',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ creatorProfileId }),
        })
      )
    );
    expect(success).toHaveBeenCalledWith('YouTube disconnected');
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('routes a non-calendar suggestion to Inbox without disabled booking controls', () => {
    render(
      <ConnectorsClient
        connectors={disconnectedConnectors}
        creatorProfileId={null}
        isDev={false}
        suggestedActions={[
          {
            id: 'thumbnail',
            kind: 'youtube.thumbnail_experiment',
            title: 'Compare thumbnails',
            startsAt: '',
            endsAt: null,
            venueName: null,
            city: null,
            region: null,
            country: null,
            confidence: null,
            rationale: 'Review approved candidates',
            sourceRef: { messageId: '', subject: '' },
            status: 'pending',
          },
        ]}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Review Compare thumbnails in Inbox' })
    ).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(screen.queryByText('Date unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Location unavailable')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Approve|Reject/ })
    ).not.toBeInTheDocument();
  });
});
