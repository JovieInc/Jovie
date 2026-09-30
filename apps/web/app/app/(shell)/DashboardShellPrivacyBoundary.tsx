'use client';

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { WorkspaceLockScreen } from '@/features/workspace-lock/WorkspaceLockScreen';
import {
  getWorkspacePrivacyLockState,
  WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT,
  WorkspacePrivacyLockError,
  type WorkspacePrivacyLockState,
} from '@/lib/workspace-lock/workspace-lock';
import type { AppShellMode } from '@/types/app-shell';
import type { DashboardData } from './dashboard/actions/dashboard-data';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';

const EMPTY_PROFILE_COMPLETION: DashboardData['profileCompletion'] = {
  percentage: 0,
  completedCount: 0,
  totalCount: 0,
  steps: [],
  profileIsLive: false,
};

function redactedDashboardData(
  userId: string,
  sidebarCollapsed: boolean
): DashboardData {
  return {
    user: { id: userId },
    creatorProfiles: [],
    selectedProfile: null,
    needsOnboarding: false,
    sidebarCollapsed,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: true,
    tippingStats: {
      tipClicks: 0,
      qrTipClicks: 0,
      linkTipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: EMPTY_PROFILE_COMPLETION,
  };
}

export function DashboardShellPrivacyBoundary({
  mode,
  userId,
  dashboardData,
  initiallyLocked,
  privacyEnabled,
  lockedUntil,
  sidebarDefaultOpen,
  previewPanelDefaultOpen,
  persistSidebarCollapsed,
  unlockedShellChrome,
  children,
}: {
  mode: AppShellMode;
  userId: string;
  dashboardData: DashboardData | null;
  initiallyLocked: boolean;
  privacyEnabled: boolean;
  lockedUntil: string | null;
  sidebarDefaultOpen: boolean;
  previewPanelDefaultOpen: boolean;
  persistSidebarCollapsed: (collapsed: boolean) => Promise<void>;
  unlockedShellChrome?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [privacyState, setPrivacyState] = useState<WorkspacePrivacyLockState>(
    () => ({
      enabled: privacyEnabled,
      locked: initiallyLocked,
      unlockedUntil: lockedUntil,
    })
  );
  const [recovery, setRecovery] = useState<'retry' | 'reloading' | null>(null);
  const recoveryDeadline = useRef<number | null>(null);
  const revalidationInFlight = useRef(false);
  const revalidationGeneration = useRef(0);

  useEffect(
    () => () => {
      revalidationGeneration.current += 1;
    },
    [mode]
  );

  const revalidate = useCallback(async () => {
    if (
      mode !== 'ov' ||
      revalidationInFlight.current ||
      recovery === 'reloading' ||
      (recovery === 'retry' && !navigator.onLine)
    )
      return;
    const originalRecoveryDeadline = recoveryDeadline.current;
    if (
      originalRecoveryDeadline !== null &&
      originalRecoveryDeadline <= Date.now()
    ) {
      recoveryDeadline.current = null;
      setRecovery(null);
      revalidationGeneration.current += 1;
      return;
    }
    revalidationInFlight.current = true;
    const generation = revalidationGeneration.current;
    // Browser timers may be suspended while a tab is backgrounded. Check the
    // server receipt deadline before starting an async refresh so private RSC
    // children are hidden immediately when the user returns.
    const deadline = privacyState.unlockedUntil
      ? Date.parse(privacyState.unlockedUntil)
      : Number.NaN;
    const localDeadlineExpired =
      privacyState.enabled &&
      !privacyState.locked &&
      (!Number.isFinite(deadline) || deadline <= Date.now());
    if (localDeadlineExpired)
      setPrivacyState(current => ({ ...current, locked: true }));
    try {
      const state = await getWorkspacePrivacyLockState();
      if (generation !== revalidationGeneration.current) return;
      // A suspended expiry timer must not let a late recovery response reload.
      if (
        originalRecoveryDeadline !== null &&
        originalRecoveryDeadline <= Date.now()
      ) {
        recoveryDeadline.current = null;
        setRecovery(null);
        revalidationGeneration.current += 1;
        return;
      }
      const deadlineExpiredWhileRefreshing =
        privacyState.enabled &&
        !privacyState.locked &&
        (!Number.isFinite(deadline) || deadline <= Date.now());
      if (deadlineExpiredWhileRefreshing) {
        setPrivacyState(current => ({ ...current, locked: true }));
      }
      if (
        (privacyState.locked ||
          localDeadlineExpired ||
          deadlineExpiredWhileRefreshing) &&
        (!state.enabled || !state.locked)
      ) {
        if (originalRecoveryDeadline !== null) setRecovery('reloading');
        globalThis.location?.reload();
        return;
      }
      recoveryDeadline.current = null;
      setRecovery(null);
      setPrivacyState(state);
    } catch (error) {
      if (
        generation === revalidationGeneration.current &&
        privacyState.enabled
      ) {
        const retryDeadline = originalRecoveryDeadline ?? deadline;
        const canRetry =
          error instanceof WorkspacePrivacyLockError &&
          (error.code === 'unconfirmed' || error.code === 'timeout') &&
          (originalRecoveryDeadline !== null || !privacyState.locked) &&
          Number.isFinite(retryDeadline) &&
          retryDeadline > Date.now();
        if (originalRecoveryDeadline !== null && !canRetry)
          revalidationGeneration.current += 1;
        recoveryDeadline.current = canRetry ? retryDeadline : null;
        setRecovery(canRetry ? 'retry' : null);
        setPrivacyState(current =>
          current.enabled ? { ...current, locked: true } : current
        );
      }
    } finally {
      revalidationInFlight.current = false;
    }
  }, [
    mode,
    recovery,
    privacyState.enabled,
    privacyState.locked,
    privacyState.unlockedUntil,
  ]);

  useEffect(() => {
    if (mode !== 'ov') return;
    const onConfirmedLock = (event: Event) => {
      const state = (event as CustomEvent<WorkspacePrivacyLockState>).detail;
      if (!state?.enabled || !state.locked) return;
      revalidationGeneration.current += 1;
      recoveryDeadline.current = null;
      setRecovery(null);
      setPrivacyState(state);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const onOnline = () => {
      if (recovery === 'retry') onVisible();
    };
    window.addEventListener(
      WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT,
      onConfirmedLock
    );
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(
        WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT,
        onConfirmedLock
      );
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode, recovery, revalidate]);

  useEffect(() => {
    if (mode !== 'ov' || (privacyState.locked && recovery !== 'retry')) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void revalidate();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [mode, privacyState.enabled, privacyState.locked, recovery, revalidate]);

  useEffect(() => {
    if (
      mode !== 'ov' ||
      !privacyState.enabled ||
      (privacyState.locked && recoveryDeadline.current === null)
    )
      return;
    if (!privacyState.unlockedUntil) {
      setPrivacyState(current => ({ ...current, locked: true }));
      return;
    }
    const deadline = Date.parse(privacyState.unlockedUntil);
    if (!Number.isFinite(deadline)) {
      setPrivacyState(current => ({ ...current, locked: true }));
      return;
    }
    const timer = window.setTimeout(
      () => {
        if (recoveryDeadline.current !== null) {
          revalidationGeneration.current += 1;
          recoveryDeadline.current = null;
          setRecovery(null);
        }
        setPrivacyState(current => ({ ...current, locked: true }));
      },
      Math.max(0, deadline - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [mode, privacyState]);

  const effectiveLock = mode === 'ov' && privacyState.locked;
  const shellData = effectiveLock
    ? redactedDashboardData(userId, dashboardData?.sidebarCollapsed ?? false)
    : dashboardData;

  if (!shellData) return null;

  return (
    <DashboardDataProvider value={shellData}>
      {!effectiveLock ? unlockedShellChrome : null}
      <AuthShellWrapper
        mode={mode}
        isWorkspaceLocked={effectiveLock}
        persistSidebarCollapsed={persistSidebarCollapsed}
        sidebarDefaultOpen={sidebarDefaultOpen}
        previewPanelDefaultOpen={previewPanelDefaultOpen}
      >
        {effectiveLock ? (
          recovery ? (
            <div
              role='status'
              className='flex h-full min-h-1/2 flex-col items-center justify-center gap-4 px-6'
            >
              <p className='text-sm text-secondary-token'>
                {recovery === 'reloading'
                  ? 'Restoring Ovie…'
                  : 'Reconnecting to Ovie…'}
              </p>
              <Button
                variant='secondary'
                disabled={recovery === 'reloading'}
                onClick={() => void revalidate()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <WorkspaceLockScreen />
          )
        ) : (
          children
        )}
      </AuthShellWrapper>
    </DashboardDataProvider>
  );
}
