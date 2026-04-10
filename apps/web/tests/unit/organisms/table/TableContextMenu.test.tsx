import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableContextMenu } from '@/components/organisms/table/molecules/TableContextMenu';

const tableActionMenuMock = vi.fn(
  ({
    children,
    items,
  }: {
    children: ReactNode;
    items: Array<{ id: string; label: string }>;
  }) => (
    <div>
      <div data-testid='context-items'>
        {items.map(item => item.id).join(',')}
      </div>
      {children}
    </div>
  )
);

vi.mock('@/components/atoms/table-action-menu/TableActionMenu', () => ({
  TableActionMenu: (props: {
    children: ReactNode;
    items: Array<{ id: string; label: string }>;
  }) => tableActionMenuMock(props),
}));

describe('TableContextMenu', () => {
  it('defers getItems until the menu opens', () => {
    const getItems = vi.fn(() => [
      {
        id: 'edit',
        label: 'Edit',
        onClick: vi.fn(),
      },
    ]);

    render(
      <TableContextMenu getItems={getItems}>
        <div>Row</div>
      </TableContextMenu>
    );

    expect(getItems).not.toHaveBeenCalled();
    expect(screen.getByTestId('context-items')).toBeEmptyDOMElement();

    fireEvent.contextMenu(screen.getByText('Row'));

    expect(getItems).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('context-items')).toHaveTextContent('edit');
  });

  it('still supports eager items for existing call sites', () => {
    render(
      <TableContextMenu
        items={[
          {
            id: 'copy',
            label: 'Copy',
            onClick: vi.fn(),
          },
        ]}
      >
        <div>Row</div>
      </TableContextMenu>
    );

    expect(screen.getByTestId('context-items')).toHaveTextContent('copy');
  });

  it('supports async getItems resolution', async () => {
    const getItems = vi.fn(
      async () =>
        [
          {
            id: 'delete',
            label: 'Delete',
            onClick: vi.fn(),
          },
        ] as const
    );

    render(
      <TableContextMenu getItems={getItems}>
        <div>Async Row</div>
      </TableContextMenu>
    );

    fireEvent.contextMenu(screen.getByText('Async Row'));

    expect(screen.getByTestId('context-items')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('context-items')).toHaveTextContent('delete');
    });
  });
});
