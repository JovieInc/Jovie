import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NewReleaseHeaderAction } from './NewReleaseHeaderAction';

type Props = ComponentProps<typeof NewReleaseHeaderAction>;

function renderAction(overrides: Partial<Props> = {}) {
  const onSyncSpotify = vi.fn();
  const onCreateManual = vi.fn();
  const view = render(
    <TooltipProvider>
      <NewReleaseHeaderAction
        canCreateManualReleases
        onSyncSpotify={onSyncSpotify}
        onCreateManual={onCreateManual}
        {...overrides}
      />
    </TooltipProvider>
  );
  return { ...view, onSyncSpotify, onCreateManual };
}

describe('NewReleaseHeaderAction certificate', () => {
  it('syncs from the menu and keeps it open, then closes it on Add manually', async () => {
    const user = userEvent.setup();
    const { container, onSyncSpotify, onCreateManual } = renderAction();

    const trigger = screen.getByRole('button', {
      name: 'Create A New Release',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expectNoA11yViolations(container);

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    await expectNoA11yViolations(menu);

    await user.click(
      screen.getByRole('menuitem', { name: 'Sync from Spotify' })
    );
    expect(onSyncSpotify).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Add manually' }));
    expect(onCreateManual).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onSyncSpotify).toHaveBeenCalledTimes(1);
  });

  it('opens from the keyboard and disables the sync item while syncing', async () => {
    const user = userEvent.setup();
    const { onSyncSpotify, onCreateManual } = renderAction({ isSyncing: true });

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Create A New Release' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');

    const syncing = await screen.findByRole('menuitem', { name: 'Syncing...' });
    expect(syncing).toHaveAttribute('aria-disabled', 'true');
    await user.click(syncing);
    expect(onSyncSpotify).not.toHaveBeenCalled();

    await user.click(screen.getByRole('menuitem', { name: 'Add manually' }));
    expect(onCreateManual).toHaveBeenCalledTimes(1);
  });

  it('is a single sync button when manual creation is not on the plan', async () => {
    const user = userEvent.setup();
    const { container, onSyncSpotify, onCreateManual } = renderAction({
      canCreateManualReleases: false,
    });

    expect(
      screen.queryByRole('button', { name: 'Create A New Release' })
    ).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Sync from Spotify' }));
    expect(onSyncSpotify).toHaveBeenCalledTimes(1);
    expect(onCreateManual).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables the single sync button while syncing', async () => {
    const user = userEvent.setup();
    const { container, onSyncSpotify } = renderAction({
      canCreateManualReleases: false,
      isSyncing: true,
    });

    const button = screen.getByRole('button', { name: 'Syncing...' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSyncSpotify).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
