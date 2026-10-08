import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const { error, fetchMock, push, refresh, success, urlError } = vi.hoisted(
  () => ({
    error: vi.fn(),
    fetchMock: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    success: vi.fn(),
    urlError: { value: '' },
  })
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams({ error: urlError.value }),
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

function renderClient(
  props: Partial<ComponentProps<typeof ConnectorsClient>> = {}
) {
  return render(
    <ConnectorsClient
      connectors={disconnectedConnectors}
      creatorProfileId='profile-1'
      isDev={false}
      {...props}
    />
  );
}

describe('ConnectorsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlError.value = '';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  it('shows consent failure without echoing callback details or claiming connection success', () => {
    urlError.value = 'oauth_denied_private_provider_detail';
    renderClient();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The connection did not finish.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(urlError.value);
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unavailable and identity-less providers visible without offering usable connections', async () => {
    renderClient({
      connectors: {
        ...disconnectedConnectors,
        spotify: {
          status: 'not_connected',
          available: false,
          unavailableReason: 'Setup unavailable',
        },
      },
      creatorProfileId: null,
    });
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
    renderClient({
      creatorProfileId: '22222222-2222-4222-8222-222222222222',
      returnTo: '/app/ov/integrations',
    });
    await user.click(
      youtubeRow().getByRole('button', { name: 'Connect YouTube' })
    );
    expect(push).toHaveBeenCalledWith(
      '/api/connectors/youtube/authorize?returnTo=%2Fapp%2Fov%2Fintegrations&creatorProfileId=22222222-2222-4222-8222-222222222222'
    );
    expect(
      youtubeRow().getByRole('button', { name: 'Connect YouTube' })
    ).toHaveAttribute('aria-disabled', 'true');
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
    renderClient({
      connectors: {
        ...disconnectedConnectors,
        youtube: { status: 'connected', scopes: YOUTUBE_OAUTH_SCOPES },
      },
    });
    const button = youtubeRow().getByRole('button', {
      name: 'Disconnect YouTube',
    });
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(youtubeRow().getByText('Disconnecting…')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    finish?.({ ok: false });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(button).toHaveFocus();
    expect(
      youtubeRow().getByText('Failed to disconnect. Try again.')
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('YouTube disconnected')
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(button).toHaveFocus();
  });

  it.each([true, false])(
    'resets disconnect state when identity changes (pending=%s)',
    async pending => {
      let finish: (value: { ok: boolean }) => void = () => {};
      fetchMock.mockReturnValueOnce(
        new Promise(resolve => {
          finish = resolve;
        })
      );
      const status = () => youtubeRow().getByRole('status');
      const connected = {
        ...disconnectedConnectors,
        youtube: { status: 'connected' as const, scopes: YOUTUBE_OAUTH_SCOPES },
      };
      const client = (identity: string) => (
        <ConnectorsClient
          key={`user:${identity}`}
          connectors={connected}
          creatorProfileId={identity}
          isDev={false}
        />
      );
      const { rerender } = render(client('identity-a'));
      await userEvent.click(
        youtubeRow().getByRole('button', { name: 'Disconnect YouTube' })
      );
      if (!pending) {
        finish({ ok: true });
        await waitFor(() => expect(status()).toHaveTextContent('Disconnected'));
      }
      rerender(client('identity-b'));
      expect(status()).toHaveTextContent('Connected');
      expect(
        youtubeRow().getByRole('button', { name: 'Disconnect YouTube' })
      ).toBeEnabled();
      if (pending) finish({ ok: true });
      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(status()).toHaveTextContent('Connected');
    }
  );

  it('lists providers and discloses connected YouTube permissions', async () => {
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
    await userEvent.click(youtubeRow().getByText('Details'));
    expect(
      youtubeRow().getByRole('list', { name: 'YouTube permissions' })
    ).toHaveTextContent('Apply approved thumbnails · Requires approval');
  });

  it('clears both Google rows after an acknowledged shared disconnect', async () => {
    const user = userEvent.setup();
    renderClient({
      connectors: {
        ...disconnectedConnectors,
        gmail: { status: 'connected', accountLabel: 'artist@example.test' },
        google_calendar: {
          status: 'connected',
          accountLabel: 'artist@example.test',
        },
      },
    });
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
