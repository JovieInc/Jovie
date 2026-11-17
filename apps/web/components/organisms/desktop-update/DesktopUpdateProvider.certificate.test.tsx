/**
 * @vitest-environment jsdom
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banner } from '@/components/feedback/banner-store';
import {
  availableUpdate as available,
  installDesktopUpdateBridge as installBridge,
  uninstallDesktopUpdateBridge,
} from '@/lib/desktop/desktop-updates.test-utils';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DesktopUpdateProvider,
  useDesktopUpdateContext,
} from './DesktopUpdateProvider';

function OpenUpdateButton() {
  const ctx = useDesktopUpdateContext();
  return (
    <button type='button' onClick={() => ctx?.openModal()}>
      Update menu item
    </button>
  );
}

beforeEach(() => {
  banner.dismiss();
  uninstallDesktopUpdateBridge();
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ summary: 'Ship it', items: [] }), {
          status: 200,
        })
    )
  );
});

afterEach(() => {
  uninstallDesktopUpdateBridge();
  vi.unstubAllGlobals();
});

describe('DesktopUpdateProvider certificate', () => {
  it('renders only its children on web, axe-clean', async () => {
    const { container } = render(
      <DesktopUpdateProvider>
        <main>Shell content</main>
      </DesktopUpdateProvider>
    );

    expect(screen.getByRole('main')).toHaveTextContent('Shell content');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the available-update dialog axe-clean and Later records the version', async () => {
    const user = userEvent.setup();
    const { emit } = installBridge({ state: 'idle' });
    const { baseElement } = render(
      <DesktopUpdateProvider>
        <OpenUpdateButton />
      </DesktopUpdateProvider>
    );

    act(() => emit(available('26.11.14')));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Jovie 26.11.14 Is Available');
    await expectNoA11yViolations(baseElement);

    await user.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(
      () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      { timeout: 3000 }
    );
    expect(
      window.sessionStorage.getItem('jovie:desktop-update:dismissed')
    ).toBe('26.11.14');
    // axe over the whole dialog document is slow when the machine is busy.
  }, 15_000);

  it('starts the download from the dialog', async () => {
    const user = userEvent.setup();
    const { bridge, emit } = installBridge({ state: 'idle' });
    render(
      <DesktopUpdateProvider>
        <OpenUpdateButton />
      </DesktopUpdateProvider>
    );

    act(() => emit(available('26.11.15')));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(bridge.download).toHaveBeenCalledTimes(1);
  });

  it('reopens an error from the menu item axe-clean and retries the check', async () => {
    const user = userEvent.setup();
    const { bridge, emit } = installBridge({ state: 'idle' });
    const { baseElement } = render(
      <DesktopUpdateProvider>
        <OpenUpdateButton />
      </DesktopUpdateProvider>
    );

    act(() => emit({ state: 'error', message: 'offline', retryable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update menu item' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);

    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(bridge.check).toHaveBeenCalledTimes(1);
  });
});
