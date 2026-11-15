import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  RuntimeUpdateProvider,
  useRuntimeUpdate,
} from './RuntimeUpdateProvider';

const state = vi.hoisted(() => ({
  desktop: true,
  available: false,
  downloaded: false,
  mismatch: false,
  install: vi.fn(async () => true),
}));
vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => state.desktop,
  useDesktopUpdate: () => ({
    available: state.available,
    downloaded: state.downloaded,
    install: state.install,
  }),
}));
vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  useVersionMonitor: () => ({
    hasMismatch: state.mismatch,
    mismatchInfo: { newVersion: '26.9.1' },
  }),
}));

beforeEach(() => {
  Object.assign(state, {
    desktop: true,
    available: false,
    downloaded: false,
    mismatch: false,
  });
  state.install.mockReset();
  state.install.mockResolvedValue(true);
});

function UpdateProbe() {
  const update = useRuntimeUpdate();
  if (!update?.available) return <p>Shell content</p>;
  return (
    <>
      <button
        type='button'
        onClick={update.apply}
        aria-disabled={update.busy || undefined}
        aria-describedby='runtime-update-description'
      >
        {update.title}
      </button>
      <p id='runtime-update-description'>{update.description}</p>
    </>
  );
}

describe('RuntimeUpdateProvider certificate', () => {
  it('renders its children untouched when no update exists, axe-clean', async () => {
    const { container } = render(
      <RuntimeUpdateProvider>
        <main>
          <UpdateProbe />
        </main>
      </RuntimeUpdateProvider>
    );
    expect(screen.getByText('Shell content')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('installs a downloaded desktop update once on apply', async () => {
    const user = userEvent.setup();
    state.available = true;
    state.downloaded = true;
    const { container } = render(
      <RuntimeUpdateProvider>
        <main>
          <UpdateProbe />
        </main>
      </RuntimeUpdateProvider>
    );
    await user.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    expect(state.install).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(container);
  });

  it('clears the busy state when the desktop install fails', async () => {
    const user = userEvent.setup();
    state.available = true;
    state.downloaded = true;
    state.install.mockRejectedValueOnce(new Error('install failed'));
    render(
      <RuntimeUpdateProvider>
        <UpdateProbe />
      </RuntimeUpdateProvider>
    );
    await user.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Restart Jovie to update' })
      ).not.toHaveAttribute('aria-disabled')
    );
  });

  it('describes a web version mismatch as a reload', async () => {
    state.desktop = false;
    state.mismatch = true;
    const { container } = render(
      <RuntimeUpdateProvider>
        <main>
          <UpdateProbe />
        </main>
      </RuntimeUpdateProvider>
    );
    const button = screen.getByRole('button', {
      name: 'Reload Jovie to update',
    });
    expect(button).toHaveAccessibleDescription(/Reload when ready\.$/);
    await expectNoA11yViolations(container);
  });
});
