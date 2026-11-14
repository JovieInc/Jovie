import type { DesktopUpdateViewState } from './desktop-updates';

// State machine behind DesktopUpdateControl. The main process already flattens
// electron-updater's events into one DesktopUpdatePhase (see
// apps/desktop/src/desktop-auto-update.ts). This reducer layers on what only
// the renderer knows: whether the person asked for the check or the restart,
// whether the machine is online, and whether a restart has stalled.
//
// The reducer is pure. Timers, IPC and connectivity listeners live in
// useDesktopUpdateState, which only dispatches actions.

/** What the Retry action re-runs after a failure. */
export type DesktopUpdateRetry = 'check' | 'restart';

export type DesktopUpdateControlState =
  /** Idle, up to date, unsupported, or a background check nobody asked for. */
  | { readonly kind: 'hidden' }
  /** A check the person asked for, or one recovering from a failure. */
  | { readonly kind: 'checking' }
  | { readonly kind: 'available'; readonly version: string }
  | {
      readonly kind: 'downloading';
      readonly version: string | null;
      /** 0 to 100, clamped. */
      readonly percent: number;
    }
  | { readonly kind: 'ready'; readonly version: string }
  /** quitAndInstall was requested; shown until the app quits. */
  | { readonly kind: 'restarting'; readonly version: string }
  | {
      readonly kind: 'failed';
      readonly retry: 'check';
      readonly version: string | null;
    }
  | {
      readonly kind: 'failed';
      readonly retry: 'restart';
      readonly version: string;
    }
  /** The check or download failed because the network is unreachable. */
  | { readonly kind: 'offline' };

export type DesktopUpdateControlKind = DesktopUpdateControlState['kind'];

export type DesktopUpdateControlAction =
  /** A phase pushed (or first read) over the desktop-update-state IPC. */
  | {
      readonly type: 'phase';
      readonly phase: DesktopUpdateViewState;
      readonly online: boolean;
    }
  /** The person pressed Retry. */
  | { readonly type: 'retry-requested' }
  /** The check IPC answered `ok: false` or threw. */
  | { readonly type: 'check-rejected'; readonly reason?: string }
  /** The person pressed Restart. */
  | { readonly type: 'restart-requested' }
  /** The install IPC answered `ok: false` or threw. */
  | { readonly type: 'restart-rejected'; readonly reason?: string }
  /** A check or restart produced no result within its window. */
  | { readonly type: 'timed-out' }
  | { readonly type: 'connectivity'; readonly online: boolean };

export const DESKTOP_UPDATE_CONTROL_HIDDEN: DesktopUpdateControlState = {
  kind: 'hidden',
};

/** How long a requested check may stay silent before it counts as failed. */
export const DESKTOP_UPDATE_CHECK_TIMEOUT_MS = 60_000;
/**
 * How long the app may stay open after a restart request. Squirrel.Mac can
 * spend a while staging the bundle before it quits, so this is generous.
 */
export const DESKTOP_UPDATE_RESTART_TIMEOUT_MS = 90_000;

const OFFLINE_ERROR =
  /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_IO_SUSPENDED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(?:REFUSED|RESET|CLOSED|TIMED_OUT)|ERR_TIMED_OUT|ENOTFOUND|ENETUNREACH|ENETDOWN|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET/i;

/** True when an updater error message describes an unreachable network. */
export function isOfflineUpdateError(message: string): boolean {
  return OFFLINE_ERROR.test(message);
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

function knownVersion(state: DesktopUpdateControlState): string | null {
  switch (state.kind) {
    case 'available':
    case 'downloading':
    case 'ready':
    case 'restarting':
    case 'failed':
      return state.version;
    case 'hidden':
    case 'checking':
    case 'offline':
      return null;
  }
}

function reducePhase(
  state: DesktopUpdateControlState,
  phase: DesktopUpdateViewState,
  online: boolean
): DesktopUpdateControlState {
  // Once the restart is under way only its own failure can interrupt it. A
  // background check that fires in the same moment must not flip the control.
  if (state.kind === 'restarting') {
    return phase.state === 'error'
      ? { kind: 'failed', retry: 'restart', version: state.version }
      : state;
  }

  switch (phase.state) {
    case 'unsupported':
      return DESKTOP_UPDATE_CONTROL_HIDDEN;

    case 'idle':
    case 'not-available':
      // The downloaded build stays installable whatever a later check says.
      if (state.kind === 'ready') return state;
      if (state.kind === 'failed' && state.retry === 'restart') return state;
      return DESKTOP_UPDATE_CONTROL_HIDDEN;

    case 'checking':
      // Background checks run every 30 minutes and on wake. They stay silent
      // unless they are the recovery from a state already on screen.
      if (state.kind === 'offline') return { kind: 'checking' };
      if (state.kind === 'failed' && state.retry === 'check') {
        return { kind: 'checking' };
      }
      return state;

    case 'available':
      return { kind: 'available', version: phase.version };

    case 'downloading':
      return {
        kind: 'downloading',
        version: knownVersion(state),
        percent: clampPercent(phase.percent),
      };

    case 'ready':
      return { kind: 'ready', version: phase.version };

    case 'error':
      switch (state.kind) {
        // Nobody asked for the check that failed; the next one retries.
        case 'hidden':
        // The staged build is still installable.
        case 'ready':
        // Already showing a failure with its own retry path.
        case 'failed':
        case 'offline':
          return state;
        case 'checking':
        case 'available':
        case 'downloading':
          return !online || isOfflineUpdateError(phase.message)
            ? { kind: 'offline' }
            : { kind: 'failed', retry: 'check', version: knownVersion(state) };
      }
  }
}

export function reduceDesktopUpdateControl(
  state: DesktopUpdateControlState,
  action: DesktopUpdateControlAction
): DesktopUpdateControlState {
  switch (action.type) {
    case 'phase':
      return reducePhase(state, action.phase, action.online);

    case 'retry-requested':
      if (state.kind === 'offline') return { kind: 'checking' };
      if (state.kind !== 'failed') return state;
      return state.retry === 'restart'
        ? { kind: 'restarting', version: state.version }
        : { kind: 'checking' };

    case 'check-rejected':
      if (state.kind !== 'checking') return state;
      return action.reason === 'unsupported'
        ? DESKTOP_UPDATE_CONTROL_HIDDEN
        : { kind: 'failed', retry: 'check', version: null };

    case 'restart-requested':
      return state.kind === 'ready'
        ? { kind: 'restarting', version: state.version }
        : state;

    case 'restart-rejected':
      if (state.kind !== 'restarting') return state;
      // The main process no longer holds a staged build: restarting again
      // cannot work, so recovery starts from a fresh check.
      return action.reason === 'update-not-downloaded'
        ? { kind: 'failed', retry: 'check', version: state.version }
        : { kind: 'failed', retry: 'restart', version: state.version };

    case 'timed-out':
      if (state.kind === 'checking') {
        return { kind: 'failed', retry: 'check', version: null };
      }
      if (state.kind === 'restarting') {
        return { kind: 'failed', retry: 'restart', version: state.version };
      }
      return state;

    case 'connectivity':
      if (action.online) {
        return state.kind === 'offline' ? { kind: 'checking' } : state;
      }
      return state.kind === 'failed' && state.retry === 'check'
        ? { kind: 'offline' }
        : state;
  }
}

/** The window after which a silent state counts as failed, if it has one. */
export function desktopUpdateControlTimeoutMs(
  kind: DesktopUpdateControlKind
): number | null {
  if (kind === 'checking') return DESKTOP_UPDATE_CHECK_TIMEOUT_MS;
  if (kind === 'restarting') return DESKTOP_UPDATE_RESTART_TIMEOUT_MS;
  return null;
}
