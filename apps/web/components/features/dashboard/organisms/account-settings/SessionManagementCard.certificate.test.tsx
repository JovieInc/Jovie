import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SessionManagementCard,
  SessionManagementSkeleton,
} from './SessionManagementCard';

const { listSessions, revokeSession, revokeOtherSessions, signOut } =
  vi.hoisted(() => ({
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    signOut: vi.fn(),
  }));
vi.mock('@/hooks/useJovieAuth', () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    listSessions: (...args: unknown[]) => listSessions(...args),
    revokeSession: (...args: unknown[]) => revokeSession(...args),
    revokeOtherSessions: (...args: unknown[]) => revokeOtherSessions(...args),
  },
}));

const current = {
  id: 'session-current',
  token: 'token-current',
  userAgent: 'Electron',
  updatedAt: new Date('2026-09-26T00:00:00Z'),
};
const other = {
  id: 'session-other',
  token: 'token-other',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  updatedAt: new Date('2026-09-25T00:00:00Z'),
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SessionManagementCard certificate', () => {
  it('ends another session after confirming and stays axe-clean', async () => {
    const user = userEvent.setup();
    listSessions.mockResolvedValue({ data: [current, other], error: null });
    revokeSession.mockResolvedValue({ data: { status: true }, error: null });
    const { container } = render(
      <SessionManagementCard activeSessionId='session-current' />
    );

    expect(await screen.findByText('Safari on iPhone')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'End session' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'End session' })
    );

    await waitFor(() =>
      expect(revokeSession).toHaveBeenCalledWith({ token: 'token-other' })
    );
    await waitFor(() =>
      expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument()
    );
  });

  it('recovers from an offline read with Retry', async () => {
    const user = userEvent.setup();
    listSessions
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: [current], error: null });
    const { container } = render(
      <SessionManagementCard activeSessionId='session-current' />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load active sessions'
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('This device')).toBeInTheDocument();
    expect(listSessions).toHaveBeenCalledTimes(2);
  });

  it('asks for a fresh sign-in when access is denied', async () => {
    const user = userEvent.setup();
    listSessions.mockResolvedValue({
      data: null,
      error: { code: 'SESSION_NOT_FRESH', status: 403 },
    });
    signOut.mockResolvedValue(undefined);
    const { container } = render(
      <SessionManagementCard activeSessionId='session-current' />
    );

    const action = await screen.findByRole('button', { name: 'Sign In Again' });
    await expectNoA11yViolations(container);
    await user.click(action);
    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: '/signin?redirect_url=%2Fapp%2Fsettings%2Faccount',
    });
  });

  it('keeps the skeleton, empty and RTL lists accessible', async () => {
    const skeleton = render(<SessionManagementSkeleton />);
    expect(screen.getAllByTestId('session-row-skeleton')).toHaveLength(3);
    await expectNoA11yViolations(skeleton.container);
    skeleton.unmount();

    listSessions.mockResolvedValue({ data: [], error: null });
    const empty = render(
      <SessionManagementCard activeSessionId='session-current' />
    );
    expect(await screen.findByText('No active sessions.')).toBeInTheDocument();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    listSessions.mockResolvedValue({ data: [current, other], error: null });
    const rtl = render(
      <div dir='rtl'>
        <SessionManagementCard activeSessionId='session-current' />
      </div>
    );
    expect(await screen.findByText('This device')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
