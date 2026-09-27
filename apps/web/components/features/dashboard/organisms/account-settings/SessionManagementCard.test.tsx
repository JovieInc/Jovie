import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManagementCard } from './SessionManagementCard';

const listSessions = vi.fn();
const revokeSession = vi.fn();
const revokeOtherSessions = vi.fn();

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    listSessions: (...args: unknown[]) => listSessions(...args),
    revokeSession: (...args: unknown[]) => revokeSession(...args),
    revokeOtherSessions: (...args: unknown[]) => revokeOtherSessions(...args),
  },
}));

const currentSession = {
  id: 'session-current',
  token: 'token-current',
  userAgent: 'Electron',
  updatedAt: new Date('2026-09-26T00:00:00Z'),
};

const otherSession = {
  id: 'session-other',
  token: 'token-other',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  updatedAt: new Date('2026-09-25T00:00:00Z'),
};

describe('SessionManagementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error state when the session list request fails', async () => {
    listSessions.mockResolvedValue({ data: null, error: new Error('boom') });

    render(<SessionManagementCard activeSessionId='session-current' />);

    expect(
      await screen.findByText('Unable to load active sessions right now.')
    ).toBeVisible();
  });

  it('shows an empty state when there are no sessions', async () => {
    listSessions.mockResolvedValue({ data: [], error: null });

    render(<SessionManagementCard activeSessionId='session-current' />);

    expect(await screen.findByText('No active sessions.')).toBeVisible();
  });

  it('lists sessions, labels the current device, and hides the bulk action with one session', async () => {
    listSessions.mockResolvedValue({ data: [currentSession], error: null });

    render(<SessionManagementCard activeSessionId='session-current' />);

    expect(await screen.findByText('This device')).toBeVisible();
    expect(screen.getByText('Current Session')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Sign out other sessions' })
    ).not.toBeInTheDocument();
  });

  it('ends a single other session after confirming', async () => {
    const user = userEvent.setup();
    listSessions.mockResolvedValue({
      data: [currentSession, otherSession],
      error: null,
    });
    revokeSession.mockResolvedValue({ data: { status: true }, error: null });

    render(<SessionManagementCard activeSessionId='session-current' />);

    expect(await screen.findByText('Safari on iPhone')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'End session' }));
    const confirmButtons = screen.getAllByRole('button', {
      name: 'End session',
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(revokeSession).toHaveBeenCalledWith({ token: 'token-other' });
    });
    await waitFor(() => {
      expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
    });
  });

  it('signs out every other session via the bulk action', async () => {
    const user = userEvent.setup();
    listSessions.mockResolvedValue({
      data: [currentSession, otherSession],
      error: null,
    });
    revokeOtherSessions.mockResolvedValue({
      data: { status: true },
      error: null,
    });

    render(<SessionManagementCard activeSessionId='session-current' />);

    await screen.findByText('Safari on iPhone');

    await user.click(
      screen.getByRole('button', { name: 'Sign out other sessions' })
    );
    const dialogConfirm = screen.getAllByRole('button', {
      name: 'Sign out other sessions',
    });
    await user.click(dialogConfirm[dialogConfirm.length - 1]);

    await waitFor(() => {
      expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
    });
    expect(screen.getByText('This device')).toBeVisible();
  });
});
