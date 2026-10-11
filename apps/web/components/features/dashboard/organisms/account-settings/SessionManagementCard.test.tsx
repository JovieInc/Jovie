import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDesktopWorkState,
  useDesktopWorkState,
} from '@/lib/desktop/session-work-state';
import { SessionManagementCard } from './SessionManagementCard';

const listSessions = vi.fn();
const signOut = vi.fn();
vi.mock('@/hooks/useJovieAuth', () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));
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

const idleWork = {
  hasDraft: false,
  isStreaming: false,
  isUploading: false,
  hasPendingAction: false,
  isAuthenticating: false,
};

function IdleWorkOwner() {
  useDesktopWorkState(idleWork);
  return null;
}

describe('SessionManagementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['single', 'success', 'hide'],
    ['bulk', 'returned error', 'unmount'],
    ['single', 'rejection', 'unmount'],
  ] as const)(
    'keeps %s revocation busy through %s after %s',
    async (action, outcome, removal) => {
      const pending = Promise.withResolvers<{ error: Error | null }>();
      const revoke = action === 'single' ? revokeSession : revokeOtherSessions;
      revoke.mockImplementation(() => {
        expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
        return pending.promise;
      });
      listSessions.mockResolvedValue({
        data: [currentSession, otherSession],
        error: null,
      });
      const view = render(
        <Activity mode='visible'>
          <IdleWorkOwner />
          <SessionManagementCard activeSessionId='session-current' />
        </Activity>
      );
      try {
        const name =
          action === 'single' ? 'End session' : 'Sign out other sessions';
        await userEvent.click(await screen.findByRole('button', { name }));
        await userEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name })
        );
        expect(revoke).toHaveBeenCalledTimes(1);
        if (removal === 'hide') {
          view.rerender(
            <Activity mode='hidden'>
              <IdleWorkOwner />
              <SessionManagementCard activeSessionId='session-current' />
            </Activity>
          );
        } else {
          view.unmount();
        }
        expect(getDesktopWorkState()).toBeNull();
        renderHook(() => useDesktopWorkState(idleWork));
        expect(getDesktopWorkState()).toEqual({
          ...idleWork,
          hasPendingAction: true,
        });
      } finally {
        await act(async () => {
          if (outcome === 'rejection') pending.reject(new Error('offline'));
          else
            pending.resolve({
              error: outcome === 'success' ? null : new Error('unavailable'),
            });
          await pending.promise.catch(() => {});
        });
      }
      expect(getDesktopWorkState()).toEqual(idleWork);
    }
  );

  it('retains authentication work until the awaited sign-in handoff settles', async () => {
    const pending = Promise.withResolvers<void>();
    signOut.mockReturnValue(pending.promise);
    listSessions.mockResolvedValue({
      data: null,
      error: { code: 'UNAUTHORIZED' },
    });
    const view = render(
      <SessionManagementCard activeSessionId='session-current' />
    );
    try {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Sign In Again' })
      );
      expect(signOut).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(getDesktopWorkState()).toBeNull();
      renderHook(() => useDesktopWorkState(idleWork));
      expect(getDesktopWorkState()).toEqual({
        ...idleWork,
        isAuthenticating: true,
      });
    } finally {
      await act(async () => {
        pending.resolve();
        await pending.promise;
      });
    }
    expect(getDesktopWorkState()).toEqual(idleWork);
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

  it('reports a malformed response as unavailable rather than empty', async () => {
    listSessions.mockResolvedValue({ data: {}, error: null });

    render(<SessionManagementCard activeSessionId='session-current' />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load active sessions'
    );
    expect(screen.queryByText('No active sessions.')).not.toBeInTheDocument();
  });

  it('recovers from a failed read without remounting or changing any sessions', async () => {
    listSessions
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValueOnce({ data: [currentSession], error: null });
    render(<SessionManagementCard activeSessionId='session-current' />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('This device')).toBeVisible();
    expect(listSessions).toHaveBeenCalledTimes(2);
    expect(revokeSession).not.toHaveBeenCalled();
    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('offers explicit sign-in recovery when the session is no longer fresh', async () => {
    listSessions.mockResolvedValue({
      data: null,
      error: { code: 'SESSION_NOT_FRESH', status: 403 },
    });
    signOut.mockResolvedValue(undefined);
    render(<SessionManagementCard activeSessionId='session-current' />);
    const action = await screen.findByRole('button', { name: 'Sign In Again' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign out of this device'
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
    await userEvent.click(action);
    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: '/signin?redirect_url=%2Fapp%2Fsettings%2Faccount',
    });
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
