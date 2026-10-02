import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getState, updateState, lock, ensureReady } = vi.hoisted(() => ({
  getState: vi.fn(),
  updateState: vi.fn(),
  lock: vi.fn(),
  ensureReady: vi.fn(),
}));

vi.mock('@/lib/workspace-lock/workspace-lock', async () => ({
  ...(await vi.importActual<
    typeof import('@/lib/workspace-lock/workspace-lock')
  >('@/lib/workspace-lock/workspace-lock')),
  getWorkspacePrivacyLockState: getState,
  updateWorkspacePrivacyLock: updateState,
  lockWorkspace: lock,
}));
vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  ensurePrivacyLockCanBeEnabled: ensureReady,
}));

import { OviePrivacyLockControl } from './OviePrivacyLockControl';

describe('OviePrivacyLockControl', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('checks passkey readiness before enabling, then confirms server state', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    getState.mockResolvedValue({
      enabled: false,
      locked: false,
      unlockedUntil: null,
    });
    updateState.mockResolvedValue({
      enabled: true,
      locked: true,
      unlockedUntil: null,
    });
    ensureReady.mockResolvedValue(undefined);

    render(
      <OviePrivacyLockControl ensurePrivacyLockCanBeEnabled={ensureReady} />
    );
    await screen.findByText('Off · requires an existing admin passkey');
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Ovie privacy lock' })
    );

    await waitFor(() => expect(updateState).toHaveBeenCalledWith('enable'));
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(await screen.findByText('Ovie is locked')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /turn off/i })
    ).not.toBeInTheDocument();
  });

  it('accepts idempotent enable when the server preserves a valid unlock receipt', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    getState.mockResolvedValue({
      enabled: false,
      locked: false,
      unlockedUntil: null,
    });
    updateState.mockResolvedValue({
      enabled: true,
      locked: false,
      unlockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    ensureReady.mockResolvedValue(undefined);

    render(
      <OviePrivacyLockControl ensurePrivacyLockCanBeEnabled={ensureReady} />
    );
    await screen.findByText('Off · requires an existing admin passkey');
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Ovie privacy lock' })
    );

    expect(
      await screen.findByText('On · unlocked for up to 24 hours')
    ).toBeInTheDocument();
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps protection off and exposes readiness failures without enabling', async () => {
    getState.mockResolvedValue({
      enabled: false,
      locked: false,
      unlockedUntil: null,
    });
    ensureReady.mockRejectedValue(
      new Error('Set up an admin-capable passkey first.')
    );

    render(
      <OviePrivacyLockControl ensurePrivacyLockCanBeEnabled={ensureReady} />
    );
    await screen.findByText('Off · requires an existing admin passkey');
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Ovie privacy lock' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Set up an admin-capable passkey first.'
    );
    expect(updateState).not.toHaveBeenCalled();
  });

  it('offers manual lock and disable only after confirmed unlocked state', async () => {
    getState.mockResolvedValue({
      enabled: true,
      locked: false,
      unlockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    lock.mockResolvedValue(undefined);

    render(
      <OviePrivacyLockControl ensurePrivacyLockCanBeEnabled={ensureReady} />
    );
    expect(
      await screen.findByText('On · unlocked for up to 24 hours')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Turn off Ovie privacy lock' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lock Ovie Now' })
    ).toBeInTheDocument();
  });
});
