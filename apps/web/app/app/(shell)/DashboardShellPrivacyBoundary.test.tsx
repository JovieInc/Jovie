import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { privacyState } = vi.hoisted(() => ({ privacyState: vi.fn() }));
vi.mock('@/lib/workspace-lock/workspace-lock', async () => ({
  ...(await vi.importActual<
    typeof import('@/lib/workspace-lock/workspace-lock')
  >('@/lib/workspace-lock/workspace-lock')),
  getWorkspacePrivacyLockState: privacyState,
  WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT: 'ovie:privacy-lock-confirmed',
}));
vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({
    children,
    isWorkspaceLocked,
  }: {
    children: React.ReactNode;
    isWorkspaceLocked: boolean;
  }) => <div data-locked={String(isWorkspaceLocked)}>{children}</div>,
}));
vi.mock('./dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({
    value,
    children,
  }: {
    value: { creatorProfiles: unknown[]; selectedProfile: unknown };
    children: React.ReactNode;
  }) => (
    <div
      data-profile-count={value.creatorProfiles.length}
      data-selected={String(Boolean(value.selectedProfile))}
    >
      {children}
    </div>
  ),
}));
vi.mock('@/features/workspace-lock/WorkspaceLockScreen', () => ({
  WorkspaceLockScreen: () => <div>Unlock Ovie</div>,
}));

import { WorkspacePrivacyLockError } from '@/lib/workspace-lock/workspace-lock';
import { DashboardShellPrivacyBoundary } from './DashboardShellPrivacyBoundary';
import type { DashboardData } from './dashboard/actions/dashboard-data';

const privateDashboard = {
  user: { id: 'user-1' },
  creatorProfiles: [{ id: 'private-profile' }],
  selectedProfile: { id: 'private-profile' },
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: true,
  tippingStats: { totalTips: 0, totalAmount: 0, recentTips: [] },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
} as unknown as DashboardData;

const serverState = (
  locked: boolean,
  unlockedUntil: string | null,
  enabled = true
) => ({ enabled, locked, unlockedUntil });

function expectLocked() {
  expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
  expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
  expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
}

function renderBoundary({
  mode = 'ov',
  initiallyLocked = false,
  privacyEnabled = mode === 'ov',
  lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}: {
  mode?: 'ov' | 'customer';
  initiallyLocked?: boolean;
  privacyEnabled?: boolean;
  lockedUntil?: string | null;
} = {}) {
  return render(
    <DashboardShellPrivacyBoundary
      mode={mode}
      userId='user-1'
      dashboardData={privateDashboard}
      initiallyLocked={initiallyLocked}
      privacyEnabled={privacyEnabled}
      lockedUntil={lockedUntil}
      sidebarDefaultOpen
      previewPanelDefaultOpen
      persistSidebarCollapsed={async () => {}}
      unlockedShellChrome={<div>Private shell chrome</div>}
    >
      <div>Private page content</div>
    </DashboardShellPrivacyBoundary>
  );
}

describe('DashboardShellPrivacyBoundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    privacyState.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders only the unlock screen and redacted provider data when Ovie starts locked', () => {
    renderBoundary({ initiallyLocked: true, lockedUntil: null });

    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-profile-count="0"][data-selected="false"]')
    ).toBeTruthy();
  });

  it('keeps default-off Ovie available after failed revalidation despite expired legacy policy', async () => {
    privacyState.mockRejectedValue(new Error('offline'));
    renderBoundary({
      mode: 'ov',
      initiallyLocked: false,
      privacyEnabled: false,
      lockedUntil: null,
    });

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    expect(screen.getByText('Private shell chrome')).toBeInTheDocument();
    expect(screen.queryByText('Unlock Ovie')).not.toBeInTheDocument();
    expect(privacyState).toHaveBeenCalledOnce();
  });

  it('locks exactly at the server-provided 24-hour deadline and hides mounted private surfaces', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    renderBoundary({ lockedUntil: new Date(deadline).toISOString() });

    expect(screen.getByText('Private page content')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));

    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
    expect(privacyState).not.toHaveBeenCalled();
  });

  it('fails closed when privacy revalidation fails on focus', async () => {
    privacyState.mockRejectedValue(new Error('offline'));
    renderBoundary();

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
  });

  it('honors the confirmed deadline without sliding it on repeated polls', async () => {
    const start = new Date('2026-09-29T12:00:00.000Z');
    vi.setSystemTime(start);
    const originalDeadline = new Date(start.getTime() + 60_000);
    const refreshedDeadline = new Date(start.getTime() + 2 * 60_000);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    privacyState.mockResolvedValue(
      serverState(false, refreshedDeadline.toISOString())
    );
    renderBoundary({ lockedUntil: originalDeadline.toISOString() });

    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(60_000 - 1));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expectLocked();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('starts a deadline when a disabled lock is enabled and unlocked in another tab', async () => {
    const start = new Date('2026-09-29T12:00:00.000Z');
    vi.setSystemTime(start);
    const deadline = new Date(start.getTime() + 60 * 60 * 1000);
    privacyState.mockResolvedValue(serverState(false, deadline.toISOString()));
    renderBoundary({
      privacyEnabled: false,
      lockedUntil: null,
    });

    await act(async () => window.dispatchEvent(new Event('focus')));
    act(() => vi.advanceTimersByTime(60 * 60 * 1000 - 1));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
  });

  it('does not poll a hidden tab and revalidates when it becomes visible', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    privacyState.mockResolvedValue(serverState(true, null));
    renderBoundary();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).not.toHaveBeenCalled();
    expect(screen.getByText('Private page content')).toBeInTheDocument();

    visibility.mockReturnValue('visible');
    await act(async () =>
      document.dispatchEvent(new Event('visibilitychange'))
    );
    expect(privacyState).toHaveBeenCalledOnce();
    expectLocked();
  });

  it('polls visible default-off tabs for a lock enabled elsewhere', async () => {
    privacyState.mockResolvedValue(serverState(true, null));
    renderBoundary({ privacyEnabled: false, lockedUntil: null });

    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(privacyState).toHaveBeenCalledOnce();
    expectLocked();
  });

  it('reloads instead of revealing stale children when another tab unlocks Ovie', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    privacyState.mockResolvedValue(
      serverState(false, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    );
    renderBoundary({ initiallyLocked: true, lockedUntil: null });

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
  });

  it('ignores an unlocked response after leaving the locked Ovie boundary', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    let resolveState!: (state: {
      enabled: boolean;
      locked: boolean;
      unlockedUntil: string | null;
    }) => void;
    privacyState.mockReturnValue(
      new Promise(resolve => {
        resolveState = resolve;
      })
    );
    const { unmount } = renderBoundary({
      initiallyLocked: true,
      lockedUntil: null,
    });

    act(() => window.dispatchEvent(new Event('focus')));
    expect(privacyState).toHaveBeenCalledOnce();
    unmount();

    await act(async () => {
      resolveState(
        serverState(false, new Date(Date.now() + 60_000).toISOString())
      );
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps a confirmed same-tab lock when an earlier fetch resolves unlocked', async () => {
    let resolveState!: (state: {
      enabled: boolean;
      locked: boolean;
      unlockedUntil: string | null;
    }) => void;
    privacyState.mockReturnValue(
      new Promise(resolve => {
        resolveState = resolve;
      })
    );
    renderBoundary();

    act(() => window.dispatchEvent(new Event('focus')));
    expect(privacyState).toHaveBeenCalledOnce();
    act(() =>
      window.dispatchEvent(
        new CustomEvent('ovie:privacy-lock-confirmed', {
          detail: serverState(true, null),
        })
      )
    );
    expectLocked();

    await act(async () => {
      resolveState(
        serverState(false, new Date(Date.now() + 60 * 60 * 1000).toISOString())
      );
      await Promise.resolve();
    });
    expectLocked();
  });

  it('locks synchronously after a suspended expiry and reloads if the refresh reports a renewal', async () => {
    const start = new Date('2026-09-29T12:00:00.000Z');
    vi.setSystemTime(start);
    const deadline = new Date(start.getTime() + 60 * 60 * 1000);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    let resolveState!: (state: {
      enabled: boolean;
      locked: boolean;
      unlockedUntil: string | null;
    }) => void;
    privacyState.mockReturnValue(
      new Promise(resolve => {
        resolveState = resolve;
      })
    );
    renderBoundary({ lockedUntil: deadline.toISOString() });

    // setSystemTime advances the wall clock without running the suspended
    // timeout, matching a tab that was backgrounded past its receipt expiry.
    vi.setSystemTime(new Date(deadline.getTime() + 1));
    act(() => window.dispatchEvent(new Event('focus')));

    expect(privacyState).toHaveBeenCalledOnce();
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(30_000));
    expect(privacyState).toHaveBeenCalledOnce();

    await act(async () => {
      resolveState({
        enabled: true,
        locked: false,
        unlockedUntil: new Date(
          deadline.getTime() + 60 * 60 * 1000
        ).toISOString(),
      });
      await Promise.resolve();
    });

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
  });

  function expectRedacted() {
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-profile-count="0"][data-selected="false"]')
    ).toBeTruthy();
  }

  it.each([
    ['unconfirmed', true],
    ['timeout', true],
    ['unconfirmed', false],
  ] as const)(
    'redacts on %s then restores only through a confirmed GET (enabled=%s) and SSR reload',
    async (code, enabled) => {
      const deadline = new Date(Date.now() + 60_000).toISOString();
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });
      privacyState.mockRejectedValueOnce(
        new WorkspacePrivacyLockError('offline', code)
      );
      renderBoundary({ lockedUntil: deadline });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expectRedacted();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Reconnecting to Ovie'
      );
      expect(screen.queryByText('Unlock Ovie')).not.toBeInTheDocument();
      expect(reload).not.toHaveBeenCalled();

      privacyState.mockResolvedValue(
        serverState(false, enabled ? deadline : null, enabled)
      );
      await act(async () => window.dispatchEvent(new Event('online')));
      expect(reload).toHaveBeenCalledOnce();
      expectRedacted();
      expect(screen.getByRole('status')).toHaveTextContent('Restoring Ovie');
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(privacyState).toHaveBeenCalledTimes(2);
      expect(reload).toHaveBeenCalledOnce();
    }
  );

  it('bounds retries to visible 30-second intervals and offers an accessible manual retry', async () => {
    privacyState.mockRejectedValue(
      new WorkspacePrivacyLockError('offline', 'timeout')
    );
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    renderBoundary();
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(privacyState).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(privacyState).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).toHaveBeenCalledTimes(2);
    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    expect(retry).toHaveFocus();
    await act(async () => fireEvent.click(retry));
    expect(privacyState).toHaveBeenCalledTimes(3);
    expectRedacted();
  });

  it.each(['unauthenticated', 'UNAUTHORIZED', 'forbidden', 'FORBIDDEN'])(
    'does not treat %s as recoverable transport',
    async code => {
      privacyState.mockRejectedValue(
        new WorkspacePrivacyLockError('denied', code)
      );
      renderBoundary();
      await act(async () => window.dispatchEvent(new Event('focus')));
      expectLocked();
      expect(
        screen.queryByRole('button', { name: 'Retry' })
      ).not.toBeInTheDocument();
      await act(async () => window.dispatchEvent(new Event('online')));
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(privacyState).toHaveBeenCalledOnce();
    }
  );

  it('stops recovery when the server confirms a manual or expired lock', async () => {
    privacyState.mockRejectedValueOnce(
      new WorkspacePrivacyLockError('offline')
    );
    renderBoundary();
    await act(async () => window.dispatchEvent(new Event('focus')));
    privacyState.mockResolvedValue(serverState(true, null));
    await act(async () => window.dispatchEvent(new Event('online')));
    expectLocked();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'])(
    'preserves a confirmed same-tab lock against late recovery %s',
    async outcome => {
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });
      privacyState.mockRejectedValueOnce(
        new WorkspacePrivacyLockError('offline')
      );
      renderBoundary();
      await act(async () => window.dispatchEvent(new Event('focus')));
      let resolve!: (value: ReturnType<typeof serverState>) => void;
      let reject!: (error: Error) => void;
      privacyState.mockImplementation(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          })
      );
      act(() => window.dispatchEvent(new Event('online')));
      expect(privacyState).toHaveBeenCalledTimes(2);
      act(() =>
        window.dispatchEvent(
          new CustomEvent('ovie:privacy-lock-confirmed', {
            detail: serverState(true, null),
          })
        )
      );
      await act(async () => {
        if (outcome === 'resolve')
          resolve(
            serverState(false, new Date(Date.now() + 60_000).toISOString())
          );
        else reject(new WorkspacePrivacyLockError('offline'));
      });
      expectLocked();
      expect(reload).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Retry' })
      ).not.toBeInTheDocument();
    }
  );

  it('rejects a late recovery unlock after the original deadline even when expiry timers were suspended', async () => {
    const deadline = Date.now() + 60_000;
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    privacyState.mockRejectedValueOnce(
      new WorkspacePrivacyLockError('offline')
    );
    renderBoundary({ lockedUntil: new Date(deadline).toISOString() });
    await act(async () => window.dispatchEvent(new Event('focus')));
    let resolve!: (value: ReturnType<typeof serverState>) => void;
    privacyState.mockImplementation(
      () =>
        new Promise(yes => {
          resolve = yes;
        })
    );
    act(() => window.dispatchEvent(new Event('online')));
    expect(privacyState).toHaveBeenCalledTimes(2);
    vi.setSystemTime(deadline + 1);
    await act(async () =>
      resolve(serverState(false, new Date(deadline + 60_000).toISOString()))
    );
    expectLocked();
    expect(reload).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).toHaveBeenCalledTimes(2);
  });

  it('ends recovery at the original expiry without refreshing or extending its receipt', async () => {
    const deadline = Date.now() + 5_000;
    privacyState.mockRejectedValue(new WorkspacePrivacyLockError('offline'));
    renderBoundary({ lockedUntil: new Date(deadline).toISOString() });
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expectLocked();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).toHaveBeenCalledOnce();
  });

  it('ignores recovery completion after unmount', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    privacyState.mockRejectedValueOnce(
      new WorkspacePrivacyLockError('offline')
    );
    const { unmount } = renderBoundary();
    await act(async () => window.dispatchEvent(new Event('focus')));
    let resolve!: (value: ReturnType<typeof serverState>) => void;
    privacyState.mockImplementation(
      () =>
        new Promise(yes => {
          resolve = yes;
        })
    );
    act(() => window.dispatchEvent(new Event('online')));
    expect(privacyState).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () =>
      resolve(serverState(false, new Date(Date.now() + 60_000).toISOString()))
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves default-off Ovie available after a real transport error', async () => {
    privacyState.mockRejectedValue(new WorkspacePrivacyLockError('offline'));
    renderBoundary({ privacyEnabled: false, lockedUntil: null });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suppresses offline polling and allows only one recovery GET across online events and ticks', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    privacyState.mockRejectedValueOnce(
      new WorkspacePrivacyLockError('offline')
    );
    renderBoundary();
    await act(async () => window.dispatchEvent(new Event('focus')));
    online.mockReturnValue(false);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(privacyState).toHaveBeenCalledOnce();
    online.mockReturnValue(true);
    let resolve!: (value: ReturnType<typeof serverState>) => void;
    privacyState.mockImplementation(
      () =>
        new Promise(yes => {
          resolve = yes;
        })
    );
    act(() => window.dispatchEvent(new Event('online')));
    expect(privacyState).toHaveBeenCalledTimes(2);
    act(() => window.dispatchEvent(new Event('online')));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(privacyState).toHaveBeenCalledTimes(2);
    expectRedacted();
    await act(async () => resolve(serverState(true, null)));
    expectLocked();
  });

  it('does not automatically revalidate a confirmed lock on online', async () => {
    renderBoundary({ initiallyLocked: true, lockedUntil: null });
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(privacyState).not.toHaveBeenCalled();
    expectLocked();
  });
});
