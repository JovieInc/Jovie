export type DesktopSecurityEvent =
  | 'auth-deep-link-invalid-params'
  | 'auth-deep-link-no-pending-flow'
  | 'auth-deep-link-pkce-expired'
  | 'auth-deep-link-flow-mismatch'
  | 'auth-deep-link-replay-rejected'
  | 'csp-header-missing'
  | 'csp-header-weakened'
  | 'remote-debugging-blocked'
  | 'window-state-clamped';

export interface DesktopSecurityEventDetail {
  readonly event: DesktopSecurityEvent;
  readonly detail?: string;
  readonly timestamp: number;
}

export type DesktopSecurityReporter = (
  event: DesktopSecurityEvent,
  detail?: string
) => void;

/**
 * Structured security telemetry for the Electron shell.
 * Uses console.error so hosted log drains can forward to Sentry later.
 */
export function createDesktopSecurityReporter(): DesktopSecurityReporter {
  return (event, detail) => {
    const payload: DesktopSecurityEventDetail = {
      event,
      detail,
      timestamp: Date.now(),
    };

    console.error('[Jovie Desktop Security]', JSON.stringify(payload));
  };
}
