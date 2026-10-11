import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createStartupMaintenanceGate,
  STARTUP_MAINTENANCE_DEADLINE_MS,
  STARTUP_MAINTENANCE_SETTLE_MS,
} from '../src/startup-maintenance';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('automatic checks wait for a usable composer and one settle period', () => {
  const gate = createStartupMaintenanceGate();
  const check = vi.fn();
  gate.request('update-check', check);
  vi.advanceTimersByTime(1_000);
  expect(check).not.toHaveBeenCalled();

  gate.composerUsable();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_SETTLE_MS - 1);
  // Later focus or repeated readiness must not restart the settle clock.
  gate.composerUsable();
  expect(check).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(check).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_DEADLINE_MS);
  expect(check).toHaveBeenCalledOnce();
});

test('absent readiness releases sign-in, non-chat and recovery work at the fixed deadline', () => {
  const gate = createStartupMaintenanceGate();
  const update = vi.fn();
  const webBuild = vi.fn();
  gate.request('update-check', update);
  gate.request('web-build-check', webBuild);
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_DEADLINE_MS - 1);
  expect(update).not.toHaveBeenCalled();
  expect(webBuild).not.toHaveBeenCalled();
  // Readiness arriving near the deadline cannot extend the bounded wait.
  gate.composerUsable();
  vi.advanceTimersByTime(1);
  expect(update).toHaveBeenCalledOnce();
  expect(webBuild).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_SETTLE_MS);
  expect(update).toHaveBeenCalledOnce();
  expect(webBuild).toHaveBeenCalledOnce();
});

test('wake and polling requests coalesce before startup and run immediately afterward', () => {
  const gate = createStartupMaintenanceGate();
  const superseded = vi.fn();
  const update = vi.fn();
  const webBuild = vi.fn();
  gate.request('update-check', superseded);
  gate.request('update-check', update);
  gate.request('web-build-check', webBuild);
  gate.request('web-build-check', webBuild);
  expect(update).not.toHaveBeenCalled();
  expect(webBuild).not.toHaveBeenCalled();
  gate.composerUsable();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_SETTLE_MS);
  expect(superseded).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledOnce();
  expect(webBuild).toHaveBeenCalledOnce();

  gate.request('update-check', update);
  gate.request('web-build-check', webBuild);
  expect(update).toHaveBeenCalledTimes(2);
  expect(webBuild).toHaveBeenCalledTimes(2);
});

test('an explicit update check can fulfill pending automatic work without releasing web checks', () => {
  const gate = createStartupMaintenanceGate();
  const automaticUpdate = vi.fn();
  const manualUpdate = vi.fn();
  const webBuild = vi.fn();
  gate.request('update-check', automaticUpdate);
  gate.request('web-build-check', webBuild);
  gate.cancelPending('update-check');
  manualUpdate();
  expect(manualUpdate).toHaveBeenCalledOnce();
  expect(webBuild).not.toHaveBeenCalled();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_DEADLINE_MS);
  expect(automaticUpdate).not.toHaveBeenCalled();
  expect(webBuild).toHaveBeenCalledOnce();
});

test('releasing an empty gate does not create an earlier web-build poll', () => {
  const gate = createStartupMaintenanceGate();
  const webBuild = vi.fn();
  gate.composerUsable();
  vi.advanceTimersByTime(STARTUP_MAINTENANCE_SETTLE_MS);
  expect(webBuild).not.toHaveBeenCalled();
  // The existing 60-second interval owns the first due poll after a splash.
  vi.advanceTimersByTime(60_000 - STARTUP_MAINTENANCE_SETTLE_MS);
  gate.request('web-build-check', webBuild);
  expect(webBuild).toHaveBeenCalledOnce();
});

test.each([false, true])(
  'quit retires pending and future work (settling=%s)',
  settling => {
    const gate = createStartupMaintenanceGate();
    const check = vi.fn();
    gate.request('update-check', check);
    if (settling) gate.composerUsable();
    gate.dispose();
    gate.composerUsable();
    gate.request('web-build-check', check);
    vi.advanceTimersByTime(STARTUP_MAINTENANCE_DEADLINE_MS);
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);
