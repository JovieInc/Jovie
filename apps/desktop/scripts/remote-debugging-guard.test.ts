import { expect, test } from 'vitest';
import {
  evaluateRemoteDebuggingGuard,
  type RemoteDebuggingGuardInput,
} from '../src/remote-debugging-guard.ts';

const base: RemoteDebuggingGuardInput = {
  isPackaged: false,
  hasRemoteDebuggingPort: false,
  hasRemoteDebuggingPipe: false,
  jovieDev: undefined,
};

test('allows a clean launch with no CDP switch', () => {
  expect(evaluateRemoteDebuggingGuard(base)).toEqual({
    blocked: false,
    reason: null,
  });
});

test('blocks a packaged build launched with --remote-debugging-port', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: true,
      hasRemoteDebuggingPort: true,
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-port' });
});

test('blocks a packaged build launched with --remote-debugging-pipe', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: true,
      hasRemoteDebuggingPipe: true,
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-pipe' });
});

test('blocks a packaged build even when JOVIE_DEV=1 is set', () => {
  // A packaged binary can be started by any local process, so the developer
  // opt-in must never re-open the hole in a shipped .app.
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: true,
      hasRemoteDebuggingPort: true,
      jovieDev: '1',
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-port' });
});

test('blocks a source run with a CDP switch but no JOVIE_DEV opt-in', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: false,
      hasRemoteDebuggingPort: true,
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-port' });
});

test('allows a source run with CDP when the developer opts in via JOVIE_DEV=1', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: false,
      hasRemoteDebuggingPort: true,
      jovieDev: '1',
    })
  ).toEqual({ blocked: false, reason: null });
});

test('does not treat a non-"1" JOVIE_DEV value as opt-in', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: false,
      hasRemoteDebuggingPort: true,
      jovieDev: 'true',
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-port' });
});

test('prefers the port reason when both switches are present', () => {
  expect(
    evaluateRemoteDebuggingGuard({
      ...base,
      isPackaged: true,
      hasRemoteDebuggingPort: true,
      hasRemoteDebuggingPipe: true,
    })
  ).toEqual({ blocked: true, reason: 'remote-debugging-port' });
});
