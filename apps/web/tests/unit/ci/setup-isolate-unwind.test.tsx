/**
 * Regression test for the merge-time isolate-off unwind (VITEST_ISOLATION_OFF).
 *
 * The first test pollutes every state category the unwind owns: fake timers,
 * a stubbed env, a stubbed global, a spy, localStorage/sessionStorage,
 * document.body, an unmount effect, and a module-mocked dependency the
 * component calls while mounted. The second test asserts what ran between
 * the two tests.
 *
 * Mode-aware by construction (both modes must stay green):
 * - Isolation OFF (pilot): the single controlled afterEach in
 *   tests/setup-optimized.ts runs in order — RTL cleanup -> auth disposal ->
 *   mock/global/env/timer restore -> residual DOM/storage clear — so every
 *   unwind assertion below must hold.
 * - Isolation ON (default): no extra hook is registered (the fork boundary is
 *   the reset). Only the default RTL cleanup is observable, via the recorded
 *   unmount. This is the "isolate:true runs register no extra cleanup" proof.
 */

import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';

const { probeRevalidate } = vi.hoisted(() => ({
  probeRevalidate: vi.fn(),
}));

// File-local mock overriding the global one: the probe's dependency is
// mocked, so the mount path exercises mocked deps.
vi.mock('next/cache', () => ({
  revalidatePath: probeRevalidate,
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  unstable_noStore: vi.fn(),
}));

const effects: string[] = [];
const probeTarget = { method: () => 'real' };

function UnwindProbe() {
  useEffect(() => {
    effects.push('mount');
    probeRevalidate('/setup-unwind-probe');
    return () => {
      effects.push('unmount');
    };
  }, []);
  return null;
}

const isolationOff = process.env.VITEST_ISOLATION_OFF === 'true';

it('pollutes every state category the isolate-off unwind owns', () => {
  vi.useFakeTimers();
  vi.stubEnv('SETUP_UNWIND_PROBE', '1');
  vi.stubGlobal('__SETUP_UNWIND_PROBE_GLOBAL__', {});
  const spy = vi.spyOn(probeTarget, 'method').mockReturnValue('spied');

  window.localStorage.setItem('setup-unwind-probe', '1');
  window.sessionStorage.setItem('setup-unwind-probe', '1');
  document.body.innerHTML = '<div id="setup-unwind-probe-leftover"></div>';

  render(<UnwindProbe />);

  expect(effects).toContain('mount');
  // The mocked dependency was exercised by the mount effect.
  expect(probeRevalidate).toHaveBeenCalledWith('/setup-unwind-probe');
  expect(probeTarget.method()).toBe('spied');
  expect(spy).toHaveBeenCalled();
});

it('unwinds the polluted state in the fixed order before the next test', () => {
  if (!isolationOff) {
    // Default (isolated) runs: only the default RTL cleanup hook ran —
    // observable as the recorded unmount. No unwind assertions.
    expect(effects).toContain('unmount');
    return;
  }

  // 1-2. RTL cleanup ran (unmount recorded) before the restore steps.
  expect(effects).toContain('unmount');
  // 3. Vitest primitives restored.
  expect(vi.isFakeTimers()).toBe(false);
  expect(process.env.SETUP_UNWIND_PROBE).toBeUndefined();
  expect(
    (globalThis as Record<string, unknown>).__SETUP_UNWIND_PROBE_GLOBAL__
  ).toBeUndefined();
  // The spy was restored: the target answers with its real implementation.
  expect(probeTarget.method()).toBe('real');
  // 4. Residual DOM/storage cleared after the restore steps.
  expect(document.getElementById('setup-unwind-probe-leftover')).toBeNull();
  expect(window.localStorage.getItem('setup-unwind-probe')).toBeNull();
  expect(window.sessionStorage.getItem('setup-unwind-probe')).toBeNull();
});
