/**
 * Better Auth's session atom defers unmount by nanostores' 1s
 * STORE_UNMOUNT_DELAY. Vitest then deletes the jsdom `window` binding.
 * The deferred cleanup calls `window.removeEventListener` and throws
 * `ReferenceError: window is not defined` — an unhandled error that fails
 * the coverage audit even when every test passed.
 *
 * This file mounts the real client the way product-evidence does, lets the
 * setup hook unmount it, then reproduces that teardown gap.
 */

import { render } from '@testing-library/react';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';

const STORE_UNMOUNT_DELAY_MS = 1000;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
  );
});

function renderSignedOutSession(): void {
  render(
    <JovieAuthValuesProvider>
      <span>signed out</span>
    </JovieAuthValuesProvider>
  );
  expect(document.body).toHaveTextContent('signed out');
}

it('mounts a Better Auth session that must not outlive jsdom', () => {
  renderSignedOutSession();
});

it('mounts again after the previous session atom was released', () => {
  renderSignedOutSession();
});

afterAll(async () => {
  const unhandled: unknown[] = [];
  const onUncaught = (error: unknown) => {
    unhandled.push(error);
  };
  process.on('uncaughtException', onUncaught);

  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window'
  );
  delete (globalThis as { window?: Window }).window;
  await new Promise(resolve => {
    setTimeout(resolve, STORE_UNMOUNT_DELAY_MS + 400);
  });
  if (windowDescriptor) {
    Object.defineProperty(globalThis, 'window', windowDescriptor);
  }

  process.off('uncaughtException', onUncaught);
  expect(unhandled).toEqual([]);
});
