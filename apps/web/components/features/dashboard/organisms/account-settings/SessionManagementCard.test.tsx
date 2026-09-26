import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManagementCard } from './SessionManagementCard';

const { mockFetchWithTimeout, mockNotifySuccess, mockNotifyError } = vi.hoisted(
  () => ({
    mockFetchWithTimeout: vi.fn(),
    mockNotifySuccess: vi.fn(),
    mockNotifyError: vi.fn(),
  })
);

vi.mock('@/lib/queries', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: mockNotifySuccess,
    error: mockNotifyError,
  }),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid='loading-skeleton' />,
}));

vi.mock('@jovie/ui', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    title: ReactNode;
    confirmLabel: ReactNode;
    onConfirm: () => void | Promise<void>;
  }) =>
    open ? (
      <div role='alertdialog' aria-label={String(title)}>
        <button type='button' onClick={() => onConfirm()}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

const CURRENT_SESSION = {
  id: 'session-current',
  ipAddress: '1.1.1.1',
  userAgent: 'ua-1',
  lastActiveAt: new Date(Date.now() - 60_000).toISOString(),
  isCurrent: true,
};
const OTHER_SESSION = {
  id: 'session-other',
  ipAddress: '2.2.2.2',
  userAgent: 'ua-2',
  lastActiveAt: new Date(Date.now() - 120_000).toISOString(),
  isCurrent: false,
};

describe('SessionManagementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error state when the sessions request fails', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('network down'));

    render(<SessionManagementCard />);

    expect(
      await screen.findByText(/unable to load active sessions/i)
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no active sessions', async () => {
    mockFetchWithTimeout.mockResolvedValue({ sessions: [] });

    render(<SessionManagementCard />);

    expect(await screen.findByText('No active sessions.')).toBeInTheDocument();
  });

  it('lists sessions and marks the current one', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      sessions: [CURRENT_SESSION, OTHER_SESSION],
    });

    render(<SessionManagementCard />);

    expect(await screen.findByTestId('sessions-list')).toBeInTheDocument();
    expect(screen.getByText('Current Session')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out 1 other session' })
    ).toBeInTheDocument();
  });

  it('ends a session after confirmation', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      sessions: [CURRENT_SESSION, OTHER_SESSION],
    });
    mockFetchWithTimeout.mockResolvedValueOnce(undefined);

    render(<SessionManagementCard />);
    await screen.findByTestId('sessions-list');

    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'End session?',
    });
    fireEvent.click(dialog.querySelector('button')!);

    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        `/api/account/sessions/${OTHER_SESSION.id}`,
        { method: 'DELETE' }
      );
    });
    expect(mockNotifySuccess).toHaveBeenCalledWith('Session ended');
  });

  it('signs out every other session after confirmation', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      sessions: [CURRENT_SESSION, OTHER_SESSION],
    });
    mockFetchWithTimeout.mockResolvedValueOnce(undefined);

    render(<SessionManagementCard />);
    await screen.findByTestId('sessions-list');

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign out 1 other session' })
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out other sessions?',
    });
    fireEvent.click(dialog.querySelector('button')!);

    await waitFor(() => {
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        '/api/account/sessions/revoke-others',
        { method: 'POST' }
      );
    });
    expect(mockNotifySuccess).toHaveBeenCalledWith(
      'Signed out of all other sessions'
    );
  });
});
