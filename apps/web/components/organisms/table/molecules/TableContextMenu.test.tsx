import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { type ContextMenuItemType, TableContextMenu } from './TableContextMenu';

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function renderRow(ui: ReactElement) {
  return render(<main>{ui}</main>);
}

const row = <div data-testid='context-row'>Release row</div>;

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId('context-row'));
}

describe('TableContextMenu (colocated)', () => {
  it('opens on right-click and runs the chosen action', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderRow(
      <TableContextMenu
        items={[
          { id: 'copy', label: 'Copy Link', onClick: onCopy },
          { type: 'separator' },
          {
            id: 'delete',
            label: 'Delete',
            destructive: true,
            disabled: true,
            onClick: vi.fn(),
          },
        ]}
      >
        {row}
      </TableContextMenu>
    );

    openMenu();
    const copy = await screen.findByRole('menuitem', { name: /Copy Link/ });
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(copy);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('renders the row alone when there are no actions', () => {
    const { container } = renderRow(
      <TableContextMenu items={[]}>{row}</TableContextMenu>
    );

    openMenu();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(container.querySelector('main')?.firstElementChild).toBe(
      screen.getByTestId('context-row')
    );
  });

  it('shows a disabled loading item while async actions resolve', async () => {
    let resolve!: (items: ContextMenuItemType[]) => void;
    const onEdit = vi.fn();
    renderRow(
      <TableContextMenu
        getItems={() =>
          new Promise<ContextMenuItemType[]>(done => {
            resolve = done;
          })
        }
      >
        {row}
      </TableContextMenu>
    );

    openMenu();
    expect(
      await screen.findByRole('menuitem', { name: /Loading/ })
    ).toHaveAttribute('aria-disabled', 'true');
    resolve([{ id: 'edit', label: 'Edit Release', onClick: onEdit }]);
    expect(
      await screen.findByRole('menuitem', { name: /Edit Release/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Loading/ })).toBeNull();
  });

  it('drops the loading item when async actions fail', async () => {
    renderRow(
      <TableContextMenu
        getItems={() => Promise.reject(new TypeError('Failed to fetch'))}
      >
        {row}
      </TableContextMenu>
    );

    openMenu();
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /Loading/ })).toBeNull()
    );
    expect(screen.getByTestId('context-row')).toBeInTheDocument();
  });

  it.each([
    [
      'open with actions',
      [
        { id: 'copy', label: 'Copy Link', onClick: () => undefined },
        {
          id: 'visibility',
          label: 'Visibility',
          items: [
            {
              id: 'shown',
              label: 'Shown on Profile',
              onClick: () => undefined,
            },
          ],
        },
      ] satisfies ContextMenuItemType[],
      undefined,
    ],
    [
      'open with long labels',
      [
        {
          id: 'copy',
          label: 'Copy Smart Link For The Extended Anniversary Remaster',
          subText: 'Includes every featured artist credit',
          onClick: () => undefined,
        },
      ] satisfies ContextMenuItemType[],
      undefined,
    ],
    [
      'open in rtl',
      [
        { id: 'copy', label: 'نسخ الرابط', onClick: () => undefined },
      ] satisfies ContextMenuItemType[],
      'rtl',
    ],
  ] as const)(
    'has no accessibility violations when %s',
    async (_name, items, dir) => {
      const { container } = renderRow(
        <div dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
          <TableContextMenu items={[...items]}>{row}</TableContextMenu>
        </div>
      );
      await expectNoA11yViolations(container);
      openMenu();
      // The menu portals to the body, outside the page landmarks, so it is
      // audited on its own.
      await expectNoA11yViolations(await screen.findByRole('menu'));
    }
  );
});
