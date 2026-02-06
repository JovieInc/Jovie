'use client';

/**
 * SentryDashboardProvider
 *
 * A client component that ensures the full Sentry SDK (with Replay integration)
 * is loaded when mounted in a dashboard context. This provider handles the
 * automatic upgrade from lite SDK (used on public pages) to full SDK.
 *
 * Use this provider in dashboard layouts to ensure complete error tracking
 * and session replay capabilities are available for authenticated users.
 *
 * @module components/providers/SentryDashboardProvider
 */

import React, { useEffect, useRef, useState } from 'react';
import type { UpgradeResult, UpgradeState } from '@/lib/sentry/lazy-replay';

/**
 * Props for SentryDashboardProvider
 */
interface SentryDashboardProviderProps {
  /**
   * Child components to render
   */
  readonly children: React.ReactNode;

  /**
   * Optional callback when SDK upgrade starts
   */
  readonly onUpgradeStart?: () => void;

  /**
   * Optional callback when SDK upgrade completes successfully
   */
  readonly onUpgradeComplete?: (result: UpgradeResult) => void;

  /**
   * Optional callback when SDK upgrade fails
   */
  readonly onUpgradeFailed?: (error: Error) => void;

  /**
   * Whether to show debug information in development mode
   * Default: false
   */
  readonly debug?: boolean;
}

/**
 * Internal state for tracking provider status
 */
interface ProviderState {
  /**
   * Current upgrade state
   */
  upgradeState: UpgradeState;

  /**
   * Whether the upgrade has been attempted
   */
  hasAttemptedUpgrade: boolean;

  /**
   * Any error that occurred during upgrade
   */
  error?: string;
}

/**
 * SentryDashboardProvider component
 *
 * This provider automatically upgrades the Sentry SDK from lite to full mode
 * when mounted. It handles:
 * - Detection of current SDK mode
 * - Lazy loading of Replay integration
 * - Deduplication of upgrade attempts
 * - Error handling and callbacks
 *
 * @example
 * // Basic usage in a dashboard layout
 * export default function DashboardLayout({ children }) {
 *   return (
 *     <SentryDashboardProvider>
 *       {children}
 *     </SentryDashboardProvider>
 *   );
 * }
 *
 * @example
 * // With callbacks for monitoring
 * <SentryDashboardProvider
 *   onUpgradeComplete={(result) => {
 *     console.log('Sentry upgraded:', result.currentMode);
 *   }}
 *   onUpgradeFailed={(error) => {
 *     console.error('Sentry upgrade failed:', error);
 *   }}
 * >
 *   {children}
 * </SentryDashboardProvider>
 */
export function SentryDashboardProvider({
  children,
  onUpgradeStart,
  onUpgradeComplete,
  onUpgradeFailed,
  debug = false,
}: SentryDashboardProviderProps): React.ReactElement {
  // State is tracked internally for callbacks but not used for rendering
  // since the SDK upgrade is non-blocking
  const [_state, setState] = useState<ProviderState>({
    upgradeState: 'idle',
    hasAttemptedUpgrade: false,
  });

  // Use a ref to track if upgrade has been initiated to prevent double-runs in StrictMode
  const upgradeInitiatedRef = useRef(false);

  useEffect(() => {
    // Prevent double-running in React StrictMode
    if (upgradeInitiatedRef.current) {
      return;
    }
    upgradeInitiatedRef.current = true;

    const performUpgrade = async (): Promise<void> => {
      setState(prev => ({
        ...prev,
        upgradeState: 'checking',
      }));

      onUpgradeStart?.();

      try {
        // Dynamically import the lazy-replay module to enable code splitting
        const { forceUpgradeToFull } = await import('@/lib/sentry/lazy-replay');

        const result = await forceUpgradeToFull();

        setState({
          upgradeState: result.state,
          hasAttemptedUpgrade: true,
          error: result.error,
        });

        if (result.success) {
          onUpgradeComplete?.(result);

          if (debug && process.env.NODE_ENV === 'development') {
            console.debug('[SentryDashboardProvider] Upgrade result:', {
              previousMode: result.previousMode,
              currentMode: result.currentMode,
              state: result.state,
            });
          }
        } else if (result.error) {
          onUpgradeFailed?.(new Error(result.error));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        setState({
          upgradeState: 'failed',
          hasAttemptedUpgrade: true,
          error: errorMessage,
        });

        onUpgradeFailed?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      }
    };

    // Only run on client side
    if (typeof window !== 'undefined') {
      performUpgrade();
    }
  }, [onUpgradeStart, onUpgradeComplete, onUpgradeFailed, debug]);

  // Render children immediately - the SDK upgrade happens in the background
  // and doesn't block rendering
  return <>{children}</>;
}

/**
 * Hook to access Sentry SDK upgrade state within the dashboard context.
 *
 * This hook provides access to the current upgrade state for components
 * that need to know whether the full SDK is active.
 *
 * @returns Object containing upgrade state information
 *
 * @example
 * function DashboardComponent() {
 *   const { isFullSdkActive, upgradeState } = useSentryDashboardState();
 *
 *   return (
 *     <div>
 *       {isFullSdkActive
 *         ? 'Session Replay is active'
 *         : 'Loading enhanced monitoring...'}
 *     </div>
 *   );
 * }
 */
export function useSentryDashboardState(): {
  isFullSdkActive: boolean;
  upgradeState: UpgradeState;
  isUpgrading: boolean;
} {
  const [state, setState] = useState<{
    isFullSdkActive: boolean;
    upgradeState: UpgradeState;
  }>({
    isFullSdkActive: false,
    upgradeState: 'idle',
  });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const checkState = async (): Promise<void> => {
      try {
        const { getUpgradeState, isUpgraded } = await import(
          '@/lib/sentry/lazy-replay'
        );

        const upgradeState = getUpgradeState();
        setState({
          isFullSdkActive: isUpgraded(),
          upgradeState,
        });

        // Stop polling once in a terminal state (not idle, checking, or upgrading)
        if (
          upgradeState !== 'idle' &&
          upgradeState !== 'checking' &&
          upgradeState !== 'upgrading'
        ) {
          if (interval) clearInterval(interval);
        }
      } catch {
        // If import fails, assume not upgraded
        setState({
          isFullSdkActive: false,
          upgradeState: 'failed',
        });
        if (interval) clearInterval(interval);
      }
    };

    if (typeof window !== 'undefined') {
      // Assign interval first so checkState can clear it if we're already in terminal state
      interval = setInterval(() => {
        checkState();
      }, 500);

      // Also run immediately
      checkState();

      return () => {
        if (interval) clearInterval(interval);
      };
    }

    return undefined;
  }, []);

  return {
    isFullSdkActive: state.isFullSdkActive,
    upgradeState: state.upgradeState,
    isUpgrading:
      state.upgradeState === 'checking' || state.upgradeState === 'upgrading',
  };
}

export default SentryDashboardProvider;
