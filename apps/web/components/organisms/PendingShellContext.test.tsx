import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  noopPendingShellContext,
  PendingShellContext,
  type PendingShellContextValue,
  type PendingShellRoute,
  usePendingShell,
} from './PendingShellContext';

function PendingShellControls() {
  const { pendingShellRoute, showPendingShell, clearPendingShell } =
    usePendingShell();
  return (
    <div>
      <p>Pending shell: {pendingShellRoute ?? 'none'}</p>
      <button type='button' onClick={() => showPendingShell('releases')}>
        Show releases shell
      </button>
      <button type='button' onClick={() => clearPendingShell('releases')}>
        Clear releases shell
      </button>
    </div>
  );
}

function StatefulProvider({
  onShow,
  onClear,
}: {
  readonly onShow: PendingShellContextValue['showPendingShell'];
  readonly onClear: PendingShellContextValue['clearPendingShell'];
}) {
  const [route, setRoute] = useState<PendingShellRoute>(null);
  return (
    <PendingShellContext.Provider
      value={{
        pendingShellRoute: route,
        showPendingShell: next => {
          onShow(next);
          setRoute(next);
        },
        clearPendingShell: target => {
          onClear(target);
          setRoute(null);
        },
      }}
    >
      <PendingShellControls />
    </PendingShellContext.Provider>
  );
}

describe('PendingShellContext certificate', () => {
  it('falls back to the no-op context without a provider, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<PendingShellControls />);

    expect(screen.getByText('Pending shell: none')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show releases shell' })
    );
    expect(screen.getByText('Pending shell: none')).toBeInTheDocument();
    expect(noopPendingShellContext.pendingShellRoute).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('passes show and clear through to the provider with the route', async () => {
    const onShow = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <StatefulProvider onShow={onShow} onClear={onClear} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Show releases shell' })
    );
    expect(onShow).toHaveBeenCalledWith('releases');
    expect(screen.getByText('Pending shell: releases')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Clear releases shell' })
    );
    expect(onClear).toHaveBeenCalledWith('releases');
    expect(screen.getByText('Pending shell: none')).toBeInTheDocument();
  });
});
