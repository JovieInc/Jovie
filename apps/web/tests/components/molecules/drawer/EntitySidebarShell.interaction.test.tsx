import { CommonDropdown } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

describe('EntitySidebarShell interactions', () => {
  it('closes the drawer on Escape through the canonical RightDrawer listener', () => {
    const onClose = vi.fn();

    render(
      <EntitySidebarShell isOpen ariaLabel='Analytics' onClose={onClose}>
        <button type='button'>Drawer action</button>
      </EntitySidebarShell>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes the visible dropdown Close action through the existing close handler', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(
      <EntitySidebarShell isOpen ariaLabel='Analytics' onClose={onClose}>
        <CommonDropdown
          items={[
            {
              id: 'close',
              type: 'action',
              label: 'Close',
              onClick: onClose,
            },
          ]}
          trigger={
            <button type='button' aria-label='More actions'>
              More actions
            </button>
          }
        />
      </EntitySidebarShell>
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets a nested menu consume Escape before the drawer close handler', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(
      <EntitySidebarShell isOpen ariaLabel='Analytics' onClose={onClose}>
        <CommonDropdown
          items={[
            {
              id: 'nested-actions',
              type: 'submenu',
              label: 'Nested actions',
              items: [
                {
                  id: 'nested-action',
                  type: 'action',
                  label: 'Nested action',
                  onClick: vi.fn(),
                },
              ],
            },
          ]}
          trigger={
            <button type='button' aria-label='More actions'>
              More actions
            </button>
          }
        />
      </EntitySidebarShell>
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const nestedTrigger = await screen.findByRole('menuitem', {
      name: 'Nested actions',
    });
    await user.click(nestedTrigger);

    const nestedAction = await screen.findByRole('menuitem', {
      name: 'Nested action',
    });
    fireEvent.keyDown(nestedAction, { key: 'Escape' });

    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: 'Nested action' })
      ).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
