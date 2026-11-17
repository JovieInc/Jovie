import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GOOGLE_OAUTH_SCOPE } from '@/lib/connectors/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ConnectorCard } from './ConnectorCard';

describe('ConnectorCard certificate', () => {
  it('connects a not-connected provider on click', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const { container } = render(
      <ConnectorCard
        provider='gmail'
        status='not_connected'
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    );

    expect(
      screen.getByRole('status', { name: 'Gmail status: Not Connected' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disconnects a connected provider and lists granted permissions', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    const { container } = render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        accountLabel='artist@example.com'
        scopes={[GOOGLE_OAUTH_SCOPE.gmailReadonly]}
        lastSyncAt='2026-11-10T18:30:00.000Z'
        onDisconnect={onDisconnect}
      />
    );

    await user.click(screen.getByLabelText('Gmail connection details'));
    expect(
      screen.getByRole('list', { name: 'Gmail permissions' })
    ).toHaveTextContent('Read booking emails');
    expect(screen.getByText(/Last synced Nov 10, 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect Gmail' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows no confirmed permissions for an empty scope list', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        accountLabel='artist@example.com'
        scopes={[]}
      />
    );

    await user.click(screen.getByLabelText('Gmail connection details'));
    expect(screen.getByText('No permissions confirmed')).toBeInTheDocument();
    expect(
      screen.getByText('Reconnect to enable missing permissions.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('offers a reconnect for missing permissions', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const { container } = render(
      <ConnectorCard
        provider='google_calendar'
        status='connected'
        accountLabel='artist@example.com'
        scopes={[GOOGLE_OAUTH_SCOPE.calendarEventsReadonly]}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the error and offers reconnect and disconnect', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const { container } = render(
      <ConnectorCard
        provider='gmail'
        status='error'
        accountLabel='artist@example.com'
        errorMessage='  Google rejected the connection.  '
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    );

    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Google rejected the connection.'
    );
    await user.click(screen.getByRole('button', { name: 'Reconnect Gmail' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect Gmail' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('falls back to reauth copy and blocks action while offline', async () => {
    const { container, rerender } = render(
      <ConnectorCard
        provider='gmail'
        status='needs_reauth'
        onConnect={vi.fn()}
      />
    );
    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Reconnect to continue syncing.'
    );
    await expectNoA11yViolations(container);

    rerender(
      <ConnectorCard
        provider='gmail'
        status='unavailable'
        available={false}
        onConnect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('status', { name: 'Gmail status: Unavailable' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Connection is unavailable. Try again later.'
    );
    expect(
      screen.getByRole('button', { name: 'Reconnect Gmail' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('marks pending work busy and labels the pending action', async () => {
    const { container } = render(
      <ConnectorCard
        provider='gmail'
        status='connected'
        accountLabel='artist@example.com'
        pending
        pendingAction='disconnect'
        onDisconnect={vi.fn()}
      />
    );

    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('button', { name: 'Disconnecting… Gmail' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy whole in a right-to-left document', async () => {
    const long =
      'Google rejected the connection because the workspace administrator has not approved third-party access.';
    const { container } = render(
      <div dir='rtl'>
        <ConnectorCard
          provider='gmail'
          status='error'
          errorMessage={long}
          actionError='Could not reconnect just now.'
          onConnect={vi.fn()}
        />
      </div>
    );

    expect(screen.getByTestId('connector-detail-gmail')).toHaveTextContent(
      'Could not reconnect just now.'
    );
    await expectNoA11yViolations(container);
  });
});
