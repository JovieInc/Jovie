import { describe, expect, it } from 'vitest';
import {
  DESKTOP_UPDATE_CHECK_TIMEOUT_MS,
  DESKTOP_UPDATE_CONTROL_HIDDEN,
  DESKTOP_UPDATE_RESTART_TIMEOUT_MS,
  type DesktopUpdateControlAction,
  type DesktopUpdateControlKind,
  type DesktopUpdateControlState,
  desktopUpdateControlTimeoutMs,
  isOfflineUpdateError,
  reduceDesktopUpdateControl,
} from './desktop-update-control-state';
import type { DesktopUpdateViewState } from './desktop-updates';

const VERSION = '26.11.12';

const phase = (
  value: DesktopUpdateViewState,
  online = true
): DesktopUpdateControlAction => ({ type: 'phase', phase: value, online });

const checkingPhase = phase({ state: 'checking' });
const availablePhase = phase({
  state: 'available',
  version: VERSION,
  releaseDate: null,
  notesUrl: 'https://jov.ie/changelog',
});
const progressPhase = (percent: number) =>
  phase({
    state: 'downloading',
    percent,
    transferredBytes: 1,
    totalBytes: 2,
    bytesPerSecond: 1,
  });
const readyPhase = phase({ state: 'ready', version: VERSION });
const errorPhase = (message = 'boom', online = true) =>
  phase({ state: 'error', message, retryable: true }, online);

function walk(
  actions: readonly DesktopUpdateControlAction[],
  from: DesktopUpdateControlState = DESKTOP_UPDATE_CONTROL_HIDDEN
): DesktopUpdateControlState {
  return actions.reduce(reduceDesktopUpdateControl, from);
}

const STATES: Record<DesktopUpdateControlKind, DesktopUpdateControlState> = {
  hidden: { kind: 'hidden' },
  checking: { kind: 'checking' },
  available: { kind: 'available', version: VERSION },
  downloading: { kind: 'downloading', version: VERSION, percent: 40 },
  ready: { kind: 'ready', version: VERSION },
  restarting: { kind: 'restarting', version: VERSION },
  failed: { kind: 'failed', retry: 'check', version: VERSION },
  offline: { kind: 'offline' },
};
const FAILED_RESTART: DesktopUpdateControlState = {
  kind: 'failed',
  retry: 'restart',
  version: VERSION,
};

describe('reduceDesktopUpdateControl', () => {
  it('walks the happy path from a found update to the restart', () => {
    let state = walk([checkingPhase]);
    expect(state).toEqual({ kind: 'hidden' });

    state = walk([availablePhase], state);
    expect(state).toEqual({ kind: 'available', version: VERSION });

    state = walk([progressPhase(0)], state);
    expect(state).toEqual({
      kind: 'downloading',
      version: VERSION,
      percent: 0,
    });

    state = walk([progressPhase(41.6), progressPhase(100)], state);
    expect(state).toEqual({
      kind: 'downloading',
      version: VERSION,
      percent: 100,
    });

    state = walk([readyPhase], state);
    expect(state).toEqual({ kind: 'ready', version: VERSION });

    state = walk([{ type: 'restart-requested' }], state);
    expect(state).toEqual({ kind: 'restarting', version: VERSION });
  });

  it('stays hidden when idle, up to date, or unsupported', () => {
    for (const value of [
      { state: 'idle' },
      { state: 'not-available' },
      { state: 'unsupported' },
    ] as const) {
      expect(walk([phase(value)])).toEqual({ kind: 'hidden' });
      expect(walk([phase(value)], STATES.checking)).toEqual({ kind: 'hidden' });
      expect(walk([phase(value)], STATES.failed)).toEqual({ kind: 'hidden' });
    }
  });

  it('keeps background checks and their failures silent', () => {
    expect(walk([checkingPhase, errorPhase()])).toEqual({ kind: 'hidden' });
    expect(walk([errorPhase('net::ERR_INTERNET_DISCONNECTED', false)])).toEqual(
      { kind: 'hidden' }
    );
  });

  it('does not let a background check disturb a visible state', () => {
    for (const kind of ['available', 'downloading', 'ready'] as const) {
      expect(walk([checkingPhase], STATES[kind])).toBe(STATES[kind]);
    }
  });

  it('clamps download progress to a determinate 0 to 100', () => {
    const percentOf = (value: number) => {
      const state = walk([progressPhase(value)], STATES.available);
      return state.kind === 'downloading' ? state.percent : null;
    };
    expect(percentOf(-5)).toBe(0);
    expect(percentOf(250)).toBe(100);
    expect(percentOf(Number.NaN)).toBe(0);
    expect(percentOf(63.4)).toBe(63.4);
  });

  it('reports a download that starts before the version is known', () => {
    expect(walk([progressPhase(10)])).toEqual({
      kind: 'downloading',
      version: null,
      percent: 10,
    });
  });

  it('fails a download and recovers through retry', () => {
    let state = walk(
      [errorPhase('sha512 checksum mismatch')],
      STATES.downloading
    );
    expect(state).toEqual({ kind: 'failed', retry: 'check', version: VERSION });

    state = walk([{ type: 'retry-requested' }], state);
    expect(state).toEqual({ kind: 'checking' });

    state = walk([checkingPhase, availablePhase, progressPhase(5)], state);
    expect(state).toEqual({
      kind: 'downloading',
      version: VERSION,
      percent: 5,
    });
  });

  it('fails a requested check that errors again', () => {
    const state = walk(
      [{ type: 'retry-requested' }, checkingPhase, errorPhase()],
      STATES.failed
    );
    expect(state).toEqual({ kind: 'failed', retry: 'check', version: null });
  });

  it('shows a recovery check that a failure is already waiting on', () => {
    expect(walk([checkingPhase], STATES.failed)).toEqual({ kind: 'checking' });
    expect(walk([checkingPhase], STATES.offline)).toEqual({ kind: 'checking' });
  });

  it('keeps an existing failure when another error arrives', () => {
    expect(walk([errorPhase()], STATES.failed)).toBe(STATES.failed);
    expect(walk([errorPhase()], FAILED_RESTART)).toBe(FAILED_RESTART);
    expect(walk([errorPhase()], STATES.offline)).toBe(STATES.offline);
  });

  it('goes offline when the network is the reason', () => {
    expect(
      walk([errorPhase('net::ERR_INTERNET_DISCONNECTED')], STATES.downloading)
    ).toEqual({ kind: 'offline' });
    expect(walk([errorPhase('boom', false)], STATES.available)).toEqual({
      kind: 'offline',
    });
    expect(walk([errorPhase('boom', false)], STATES.checking)).toEqual({
      kind: 'offline',
    });
  });

  it('retries by itself when the connection returns', () => {
    let state = walk([{ type: 'connectivity', online: false }], STATES.offline);
    expect(state).toEqual({ kind: 'offline' });

    state = walk([{ type: 'connectivity', online: true }], state);
    expect(state).toEqual({ kind: 'checking' });

    state = walk([checkingPhase, availablePhase], state);
    expect(state).toEqual({ kind: 'available', version: VERSION });
  });

  it('lets the person retry while offline', () => {
    expect(walk([{ type: 'retry-requested' }], STATES.offline)).toEqual({
      kind: 'checking',
    });
  });

  it('turns a check failure into offline when the connection drops', () => {
    expect(
      walk([{ type: 'connectivity', online: false }], STATES.failed)
    ).toEqual({ kind: 'offline' });
  });

  it('ignores connectivity changes that have nothing to recover', () => {
    for (const kind of [
      'hidden',
      'checking',
      'available',
      'downloading',
      'ready',
      'restarting',
    ] as const) {
      for (const online of [true, false]) {
        expect(walk([{ type: 'connectivity', online }], STATES[kind])).toBe(
          STATES[kind]
        );
      }
    }
    expect(
      walk([{ type: 'connectivity', online: false }], FAILED_RESTART)
    ).toBe(FAILED_RESTART);
    expect(walk([{ type: 'connectivity', online: true }], STATES.failed)).toBe(
      STATES.failed
    );
  });

  it('keeps Restart available when a later check finds nothing or fails', () => {
    for (const action of [
      phase({ state: 'not-available' }),
      phase({ state: 'idle' }),
      checkingPhase,
      errorPhase(),
    ]) {
      expect(walk([action], STATES.ready)).toBe(STATES.ready);
    }
  });

  it('follows a newer build that replaces the staged one', () => {
    const newer = phase({
      state: 'available',
      version: '26.11.13',
      releaseDate: null,
      notesUrl: 'https://jov.ie/changelog',
    });
    expect(walk([newer], STATES.ready)).toEqual({
      kind: 'available',
      version: '26.11.13',
    });
  });

  it('only restarts from ready', () => {
    for (const kind of [
      'hidden',
      'checking',
      'available',
      'downloading',
      'restarting',
      'failed',
      'offline',
    ] as const) {
      expect(walk([{ type: 'restart-requested' }], STATES[kind])).toBe(
        STATES[kind]
      );
    }
  });

  it('holds restarting until the app quits or the restart fails', () => {
    for (const action of [
      checkingPhase,
      availablePhase,
      progressPhase(10),
      readyPhase,
      phase({ state: 'not-available' }),
      phase({ state: 'idle' }),
      phase({ state: 'unsupported' }),
      { type: 'connectivity', online: false } as const,
      { type: 'retry-requested' } as const,
      { type: 'check-rejected' } as const,
    ]) {
      expect(walk([action], STATES.restarting)).toBe(STATES.restarting);
    }
  });

  it('fails a restart on an updater error and retries the restart', () => {
    let state = walk([errorPhase('ShipIt failed')], STATES.restarting);
    expect(state).toEqual(FAILED_RESTART);

    state = walk([{ type: 'retry-requested' }], state);
    expect(state).toEqual({ kind: 'restarting', version: VERSION });
  });

  it('fails a restart the main process rejects', () => {
    expect(
      walk(
        [{ type: 'restart-rejected', reason: 'invalid-request' }],
        STATES.restarting
      )
    ).toEqual(FAILED_RESTART);
    expect(walk([{ type: 'restart-rejected' }], STATES.restarting)).toEqual(
      FAILED_RESTART
    );
  });

  it('re-checks when the staged build is gone', () => {
    const state = walk(
      [{ type: 'restart-rejected', reason: 'update-not-downloaded' }],
      STATES.restarting
    );
    expect(state).toEqual({ kind: 'failed', retry: 'check', version: VERSION });
    expect(walk([{ type: 'retry-requested' }], state)).toEqual({
      kind: 'checking',
    });
  });

  it('keeps a failed restart retryable when a later check finds nothing', () => {
    expect(walk([phase({ state: 'not-available' })], FAILED_RESTART)).toBe(
      FAILED_RESTART
    );
    expect(walk([checkingPhase], FAILED_RESTART)).toBe(FAILED_RESTART);
  });

  it('fails a check or restart that never answers', () => {
    expect(walk([{ type: 'timed-out' }], STATES.checking)).toEqual({
      kind: 'failed',
      retry: 'check',
      version: null,
    });
    expect(walk([{ type: 'timed-out' }], STATES.restarting)).toEqual(
      FAILED_RESTART
    );
    for (const kind of [
      'hidden',
      'available',
      'downloading',
      'ready',
      'failed',
      'offline',
    ] as const) {
      expect(walk([{ type: 'timed-out' }], STATES[kind])).toBe(STATES[kind]);
    }
  });

  it('handles a rejected check', () => {
    expect(walk([{ type: 'check-rejected' }], STATES.checking)).toEqual({
      kind: 'failed',
      retry: 'check',
      version: null,
    });
    expect(
      walk([{ type: 'check-rejected', reason: 'unsupported' }], STATES.checking)
    ).toEqual({ kind: 'hidden' });
    expect(walk([{ type: 'check-rejected' }], STATES.ready)).toBe(STATES.ready);
  });

  it('ignores retry and restart rejections outside their states', () => {
    for (const kind of [
      'hidden',
      'checking',
      'available',
      'downloading',
      'ready',
    ] as const) {
      expect(walk([{ type: 'retry-requested' }], STATES[kind])).toBe(
        STATES[kind]
      );
      expect(walk([{ type: 'restart-rejected' }], STATES[kind])).toBe(
        STATES[kind]
      );
    }
  });

  it('accepts every phase from every state without throwing', () => {
    const phases: DesktopUpdateViewState[] = [
      { state: 'unsupported' },
      { state: 'idle' },
      { state: 'checking' },
      { state: 'not-available' },
      {
        state: 'available',
        version: VERSION,
        releaseDate: null,
        notesUrl: 'https://jov.ie/changelog',
      },
      {
        state: 'downloading',
        percent: 1,
        transferredBytes: 1,
        totalBytes: 2,
        bytesPerSecond: 1,
      },
      { state: 'ready', version: VERSION },
      { state: 'error', message: 'boom', retryable: true },
    ];
    for (const from of [...Object.values(STATES), FAILED_RESTART]) {
      for (const value of phases) {
        expect(walk([phase(value)], from)).toHaveProperty('kind');
      }
    }
  });
});

describe('isOfflineUpdateError', () => {
  it('recognizes unreachable-network errors', () => {
    for (const message of [
      'net::ERR_INTERNET_DISCONNECTED',
      'net::ERR_NAME_NOT_RESOLVED',
      'getaddrinfo ENOTFOUND github.com',
      'connect ETIMEDOUT 140.82.112.3:443',
    ]) {
      expect(isOfflineUpdateError(message)).toBe(true);
    }
  });

  it('does not treat other failures as offline', () => {
    for (const message of [
      'sha512 checksum mismatch',
      'Cannot find latest-mac.yml',
      'HttpError: 404',
    ]) {
      expect(isOfflineUpdateError(message)).toBe(false);
    }
  });
});

describe('desktopUpdateControlTimeoutMs', () => {
  it('bounds only the states that wait on the main process', () => {
    expect(desktopUpdateControlTimeoutMs('checking')).toBe(
      DESKTOP_UPDATE_CHECK_TIMEOUT_MS
    );
    expect(desktopUpdateControlTimeoutMs('restarting')).toBe(
      DESKTOP_UPDATE_RESTART_TIMEOUT_MS
    );
    for (const kind of [
      'hidden',
      'available',
      'downloading',
      'ready',
      'failed',
      'offline',
    ] as const) {
      expect(desktopUpdateControlTimeoutMs(kind)).toBeNull();
    }
  });
});
