import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AliasCollisionRecovery } from './AliasCollisionRecovery';

// Recovery renders nothing in every state, so the evidence is that the mode
// page around it stays clean and untouched when the alias decision fails.
function installLocation() {
  const replace = vi.fn();
  const url = new URL('https://jov.ie/dualipa?mode=listen#alias=listen');
  vi.stubGlobal('location', {
    hash: url.hash,
    href: url.href,
    protocol: url.protocol,
    replace,
  });
  return replace;
}

function renderOnModePage() {
  return render(
    <main>
      <h1>Dua Lipa</h1>
      <AliasCollisionRecovery username='dualipa' />
    </main>
  );
}

describe('AliasCollisionRecovery: certificate states', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'the decision request is offline',
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'the decision endpoint errors',
      () => Promise.resolve({ ok: false, json: async () => ({}) }),
    ],
    [
      'the decision body is malformed',
      () => Promise.resolve({ ok: true, json: async () => 'oops' }),
    ],
  ])(
    'stays on the mode page with no chrome when %s',
    async (_name, respond) => {
      const fetchMock = vi.fn(respond);
      vi.stubGlobal('fetch', fetchMock);
      const replace = installLocation();
      const replaceState = vi.spyOn(window.history, 'replaceState');

      const { container } = renderOnModePage();

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(replace).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
      expect(container.querySelector('main')?.children).toHaveLength(1);
      await expectNoA11yViolations(container);
      replaceState.mockRestore();
    }
  );

  it('aborts the pending decision when the page unmounts', () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise(() => undefined);
      })
    );
    installLocation();

    const { unmount } = renderOnModePage();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
