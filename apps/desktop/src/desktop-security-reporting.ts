export type DesktopSecurityEvent =
  | 'auth-deep-link-invalid-params'
  | 'auth-deep-link-no-pending-flow'
  | 'auth-deep-link-pkce-expired'
  | 'auth-deep-link-flow-mismatch'
  | 'auth-deep-link-replay-rejected'
  | 'csp-header-missing'
  | 'csp-header-weakened'
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
 * Packaged apps stay console-quiet by default; enable this only while
 * debugging desktop security events locally.
 */
export function createDesktopSecurityReporter(): DesktopSecurityReporter {
  return (event, detail) => {
    if (process.env.JOVIE_DESKTOP_SECURITY_CONSOLE !== '1') {
      return;
    }

    const payload: DesktopSecurityEventDetail = {
      event,
      detail,
      timestamp: Date.now(),
    };

    console.error('[Jovie Desktop Security]', JSON.stringify(payload));
  };
}
