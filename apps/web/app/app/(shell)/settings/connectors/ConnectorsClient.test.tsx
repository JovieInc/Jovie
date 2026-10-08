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
  SettingsPanel: ({
    children,
    title,
  }: {
    readonly children: ReactNode;
    readonly title?: string;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
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

  it('keeps unavailable and identity-less providers visible without offering usable connections', async () => {
    render(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          spotify: {
            status: 'not_connected',
            available: false,
            unavailableReason: 'Setup unavailable',
          },
        }}
        creatorProfileId={null}
        isDev={false}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Connect Spotify' })
    ).toBeDisabled();
    expect(screen.getByText('Setup unavailable')).toBeInTheDocument();
    expect(
      youtubeRow().getByRole('button', { name: 'Connect YouTube' })
    ).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('uses the same OAuth path from the operator entry and preserves its return context', async () => {
    const user = userEvent.setup();
    render(
      <ConnectorsClient
        connectors={disconnectedConnectors}
        creatorProfileId='22222222-2222-4222-8222-222222222222'
        isDev={false}
        returnTo='/app/ov/integrations'
      />
    );
    await user.click(
      youtubeRow().getByRole('button', { name: 'Connect YouTube' })
    );
    expect(push).toHaveBeenCalledWith(
      '/api/connectors/youtube/authorize?returnTo=%2Fapp%2Fov%2Fintegrations&creatorProfileId=22222222-2222-4222-8222-222222222222'
    );
    expect(
      youtubeRow().getByRole('button', { name: 'Connect YouTube' })
    ).toBeDisabled();
    expect(youtubeRow().getByText('Connecting…')).toBeInTheDocument();
  });

  it('blocks duplicate disconnects and preserves retry after a failed request', async () => {
    const user = userEvent.setup();
    let finish: ((value: { ok: boolean }) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    render(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          youtube: { status: 'connected', scopes: YOUTUBE_OAUTH_SCOPES },
        }}
        creatorProfileId='profile-1'
        isDev={false}
      />
    );
    const button = youtubeRow().getByRole('button', {
      name: 'Disconnect YouTube',
    });
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toBeDisabled();
    expect(youtubeRow().getByText('Disconnecting…')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    finish?.({ ok: false });
    await waitFor(() => expect(button).toBeEnabled());
    expect(
      youtubeRow().getByText('Failed to disconnect. Try again.')
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('YouTube disconnected')
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('clears both Google rows after an acknowledged shared disconnect', async () => {
    const user = userEvent.setup();
    render(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          gmail: { status: 'connected', accountLabel: 'artist@example.test' },
          google_calendar: {
            status: 'connected',
            accountLabel: 'artist@example.test',
          },
        }}
        creatorProfileId='profile-1'
        isDev={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Disconnect Gmail' }));
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Gmail status: Disconnected' })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('status', {
        name: 'Google Calendar status: Disconnected',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disconnect Gmail' })
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connectors/google/disconnect',
      expect.objectContaining({ method: 'POST', body: '{}' })
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('keeps action reviews out of connection settings', () => {
    const legacyProps = {
      connectors: disconnectedConnectors,
      creatorProfileId: 'profile-1',
      isDev: false,
      suggestedActions: [
        {
          id: 'thumbnail-experiment',
          title: 'Approve YouTube thumbnail experiment',
          startsAt: '',
          endsAt: null,
          venueName: null,
          city: null,
          region: null,
          country: null,
          confidence: 0,
          rationale: 'Try another thumbnail',
          sourceRef: { messageId: '', subject: '' },
          status: 'pending' as const,
        },
      ],
    };
    render(<ConnectorsClient {...legacyProps} />);

    expect(
      screen.queryByText('Approve YouTube thumbnail experiment')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /approve|reject/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /source email unavailable|low confidence|date|location/i
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Suggested Actions' })
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts YouTube OAuth and disconnects the selected creator profile', async () => {
    const user = userEvent.setup();
    const creatorProfileId = '22222222-2222-4222-8222-222222222222';
    const { unmount } = render(
      <ConnectorsClient
        connectors={disconnectedConnectors}
        creatorProfileId={creatorProfileId}
        isDev={false}
      />
    );

    await user.click(youtubeRow().getByRole('button', { name: /^Connect/ }));
    expect(push).toHaveBeenCalledWith(
      `/api/connectors/youtube/authorize?returnTo=${encodeURIComponent(APP_ROUTES.SETTINGS_CONNECTORS)}&creatorProfileId=${creatorProfileId}`
    );

    unmount();
    render(
      <ConnectorsClient
        connectors={{
          ...disconnectedConnectors,
          youtube: { status: 'connected' },
        }}
        creatorProfileId={creatorProfileId}
        isDev={false}
      />
    );
    await user.click(youtubeRow().getByRole('button', { name: /^Disconnect/ }));

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
});
