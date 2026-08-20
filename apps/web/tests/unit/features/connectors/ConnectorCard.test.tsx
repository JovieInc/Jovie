import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ConnectorCard,
  type ConnectorStatus,
} from '@/components/features/connectors/ConnectorCard';

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
  it.each(
    STATUS_CASES
  )('maps $status to its semantic status and $actionLabel action', ({
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

    const action = screen.getByRole('button', { name: actionLabel });
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
  });

  it('keeps the action visible but disabled when its callback is unavailable', () => {
    const { rerender } = render(
      <ConnectorCard provider='gmail' status='not_connected' />
    );

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();

    rerender(<ConnectorCard provider='gmail' status='disabled' />);
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();

    rerender(<ConnectorCard provider='gmail' status='connected' />);
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  });

  it('shows connected email or recovery detail in one stable status slot', () => {
    const { rerender } = render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        email='artist@example.com'
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
        email='artist@example.com'
        errorMessage='Google rejected the connection.'
      />
    );

    expect(screen.getByTestId('connector-detail-gmail')).toBe(detail);
    expect(detail).toHaveTextContent('Google rejected the connection.');
    expect(detail).not.toHaveTextContent('artist@example.com');

    rerender(<ConnectorCard provider='gmail' status='needs_reauth' />);
    expect(detail).toHaveTextContent('Reconnect to continue syncing.');

    rerender(
      <ConnectorCard provider='gmail' status='error' errorMessage='  ' />
    );
    expect(detail).toHaveTextContent('Connection failed. Try again.');
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
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
