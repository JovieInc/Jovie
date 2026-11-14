import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ConnectorCard,
  type ConnectorStatus,
} from '@/components/features/connectors/ConnectorCard';
import { getConnectorAvailability } from '@/lib/connectors/availability.server';

const { availabilityCredentials } = vi.hoisted(() => ({
  availabilityCredentials: {
    GOOGLE_OAUTH_CLIENT_ID: '',
    GOOGLE_OAUTH_CLIENT_SECRET: '',
    SPOTIFY_CLIENT_ID: '',
    SPOTIFY_CLIENT_SECRET: '',
  },
}));
vi.mock('@/lib/env-server', () => ({ env: availabilityCredentials }));

const STATUS_CASES = [
  {
    status: 'not_connected',
    statusLabel: 'Not Connected',
    statusVariant: 'outline',
    actionLabel: 'Connect',
    actionVariant: 'secondary',
    actionOwner: 'connect',
  },
  {
    status: 'connected',
    statusLabel: 'Connected',
    statusVariant: 'success',
    actionLabel: 'Disconnect',
    actionVariant: 'tertiary',
    actionOwner: 'disconnect',
  },
  {
    status: 'syncing',
    statusLabel: 'Syncing',
    statusVariant: 'secondary',
    actionLabel: 'Disconnect',
    actionVariant: 'tertiary',
    actionOwner: 'disconnect',
  },
  {
    status: 'error',
    statusLabel: 'Error',
    statusVariant: 'destructive',
    actionLabel: 'Reconnect',
    actionVariant: 'secondary',
    actionOwner: 'connect',
  },
  {
    status: 'needs_reauth',
    statusLabel: 'Reconnect Needed',
    statusVariant: 'warning',
    actionLabel: 'Reconnect',
    actionVariant: 'secondary',
    actionOwner: 'connect',
  },
  {
    status: 'disabled',
    statusLabel: 'Disconnected',
    statusVariant: 'outline',
    actionLabel: 'Reconnect',
    actionVariant: 'secondary',
    actionOwner: 'connect',
  },
] as const satisfies ReadonlyArray<{
  readonly status: ConnectorStatus;
  readonly statusLabel: string;
  readonly statusVariant: string;
  readonly actionLabel: string;
  readonly actionVariant: string;
  readonly actionOwner: 'connect' | 'disconnect';
}>;

describe('ConnectorCard', () => {
  it('allows revocation even when new connections are unconfigured', () => {
    const onDisconnect = vi.fn();
    const { rerender } = render(
      <ConnectorCard
        provider='gmail'
        status='not_connected'
        available={false}
        unavailableReason='Setup unavailable'
        onConnect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Connect Gmail' })
    ).toBeDisabled();
    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Setup unavailable'
    );
    rerender(
      <ConnectorCard
        provider='gmail'
        status='connected'
        available={false}
        onDisconnect={onDisconnect}
      />
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Gmail' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('shows partial permissions without claiming write access or completed sync', () => {
    render(
      <ConnectorCard
        provider='youtube'
        status='connected'
        scopes={['https://www.googleapis.com/auth/youtube.readonly']}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText('Import channel videos')).not.toBeVisible();
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Import channel videos')).toBeVisible();
    expect(
      screen.queryByText(/Apply approved thumbnails/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Reconnect to enable missing permissions.')
    ).toBeInTheDocument();
    expect(screen.getByText('No sync completed yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reconnect/ })).toBeEnabled();
  });

  it('keeps unknown connection state unusable and pending actions visible', () => {
    const { rerender, container } = render(
      <ConnectorCard
        provider='spotify'
        status='unavailable'
        onConnect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('status', { name: 'Spotify status: Unavailable' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reconnect Spotify' })
    ).toBeDisabled();
    rerender(
      <ConnectorCard
        provider='spotify'
        status='connected'
        pending
        pendingAction='disconnect'
        onDisconnect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Disconnecting… Spotify' })
    ).toBeDisabled();
    expect(screen.getByText('Disconnecting…')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it.each(STATUS_CASES)(
    'maps $status to its semantic status and $actionLabel action',
    ({
      status,
      statusLabel,
      statusVariant,
      actionLabel,
      actionVariant,
      actionOwner,
    }) => {
      const onConnect = vi.fn();
      const onDisconnect = vi.fn();

      render(
        <ConnectorCard
          provider='gmail'
          status={status}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      );

      expect(
        screen.getByRole('status', {
          name: `Gmail status: ${statusLabel}`,
        })
      ).toHaveAttribute('data-variant', statusVariant);

      if (status === 'error') {
        expect(
          screen.getByRole('status', { name: 'Gmail status: Error' })
        ).toHaveClass('text-error-text');
      }

      const action = screen.getByRole('button', {
        name: `${actionLabel} Gmail`,
      });
      expect(action).toHaveAttribute('data-variant', actionVariant);
      if (actionOwner === 'disconnect') {
        expect(action).toHaveAttribute('data-destructive', 'true');
      } else {
        expect(action).not.toHaveAttribute('data-destructive');
      }

      fireEvent.click(action);
      expect(
        actionOwner === 'connect' ? onConnect : onDisconnect
      ).toHaveBeenCalledOnce();
      expect(
        actionOwner === 'connect' ? onDisconnect : onConnect
      ).not.toHaveBeenCalled();
    }
  );

  it('keeps the action visible but disabled when its callback is unavailable', () => {
    const { rerender } = render(
      <ConnectorCard provider='gmail' status='not_connected' />
    );

    expect(screen.getByRole('button', { name: /^Connect/ })).toBeDisabled();

    rerender(<ConnectorCard provider='gmail' status='disabled' />);
    expect(screen.getByRole('button', { name: /^Reconnect/ })).toBeDisabled();

    rerender(<ConnectorCard provider='gmail' status='connected' />);
    expect(screen.getByRole('button', { name: /^Disconnect/ })).toBeDisabled();
  });

  it('preserves account identity alongside recovery details', () => {
    const { rerender } = render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        accountLabel='artist@example.com'
        errorMessage='This should stay hidden.'
      />
    );

    const detail = screen.getByTestId('connector-detail-gmail');
    expect(detail).toHaveTextContent('artist@example.com');
    expect(detail).not.toHaveTextContent('This should stay hidden.');

    rerender(
      <ConnectorCard
        provider='gmail'
        status='error'
        accountLabel='artist@example.com'
        errorMessage='Google rejected the connection.'
      />
    );

    expect(screen.getByTestId('connector-detail-gmail')).toBe(detail);
    expect(detail).toHaveTextContent('Google rejected the connection.');
    expect(detail).not.toHaveTextContent('artist@example.com');
    expect(screen.getByText('artist@example.com')).toBeInTheDocument();

    rerender(
      <ConnectorCard
        provider='gmail'
        status='connected'
        accountLabel='artist@example.com'
        actionError='Disconnect failed'
      />
    );
    expect(detail).toHaveTextContent('Disconnect failed');
    expect(screen.getByText('artist@example.com')).toBeInTheDocument();
    rerender(<ConnectorCard provider='gmail' status='needs_reauth' />);
    expect(detail).toHaveTextContent('Reconnect to continue syncing.');

    rerender(
      <ConnectorCard provider='gmail' status='error' errorMessage='  ' />
    );
    expect(detail).toHaveTextContent('Connection failed. Try again.');
  });

  it('renders the Spotify social icon for the spotify provider', () => {
    const { container } = render(
      <ConnectorCard provider='spotify' status='connected' />
    );

    expect(
      screen.getByRole('status', { name: 'Spotify status: Connected' })
    ).toBeInTheDocument();
    const iconSlot = container.querySelector('div.mt-0\\.5');
    expect(iconSlot?.querySelector('svg[fill="currentColor"]')).not.toBeNull();
    expect(iconSlot?.querySelector('.lucide')).toBeNull();
  });

  it('marks syncing as busy without changing the disconnect contract', () => {
    const onDisconnect = vi.fn();
    const { container } = render(
      <ConnectorCard
        provider='google_calendar'
        status='syncing'
        onDisconnect={onDisconnect}
      />
    );

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Disconnect/ }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});

describe('ConnectorCard against real connector availability', () => {
  it('renders the setup-unavailable reason without a retry promise or leaked credentials', () => {
    availabilityCredentials.SPOTIFY_CLIENT_ID = 'sp-id-fixture';
    availabilityCredentials.SPOTIFY_CLIENT_SECRET = 'sp-secret-fixture';
    const availability = getConnectorAvailability();
    render(
      <ConnectorCard
        provider='gmail'
        status='not_connected'
        available={availability.gmail.available}
        unavailableReason={availability.gmail.reason}
        onConnect={vi.fn()}
      />
    );
    const detail = screen.getByTestId('connector-detail-gmail');
    expect(detail).toHaveTextContent(
      'Connection setup is unavailable. This connector cannot be connected yet.'
    );
    // Absent setup is not transient, so the card must not promise a retry.
    expect(detail.textContent).not.toMatch(/try again later/i);
    // Credentials never cross the server boundary, even as context.
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('sp-id-fixture');
    expect(text).not.toContain('sp-secret-fixture');
  });

  it('preserves disconnect for an existing connection when setup is unavailable', () => {
    const onDisconnect = vi.fn();
    const availability = getConnectorAvailability();
    render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        available={false}
        unavailableReason={availability.gmail.reason}
        accountLabel='artist@example.com'
        onDisconnect={onDisconnect}
      />
    );
    expect(
      screen.getByRole('status', { name: 'Gmail status: Unavailable' })
    ).toBeInTheDocument();
    const detail = screen.getByTestId('connector-detail-gmail');
    expect(detail).toHaveTextContent(
      'Connection setup is unavailable. This connector cannot be connected yet.'
    );
    expect(detail.textContent).not.toMatch(/try again later/i);
    const disconnect = screen.getByRole('button', { name: 'Disconnect Gmail' });
    expect(disconnect).toBeEnabled();
    fireEvent.click(disconnect);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('keeps the transient read-failure fallback wording when a read fails without a reason', () => {
    render(
      <ConnectorCard
        provider='gmail'
        status='unavailable'
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Connection is unavailable. Try again later.'
    );
  });
});
