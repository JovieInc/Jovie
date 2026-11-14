import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { KanbanBoard, type KanbanColumn } from './KanbanBoard';

interface Item {
  readonly id: string;
  readonly label: string;
}

const LONG_TITLE = 'Waiting on a second fact review before the invite goes out';
const LONG_LABEL =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra of Everywhere';

const COLUMNS: KanbanColumn<Item>[] = [
  {
    id: 'new',
    title: 'New',
    accent: 'var(--color-accent-purple-text)',
    items: [
      { id: 'card-1', label: 'First card' },
      { id: 'card-2', label: 'Second card' },
    ],
    count: 2,
  },
  { id: 'invited', title: 'Invited', items: [], count: 0 },
];

function renderBoard(
  props: Partial<React.ComponentProps<typeof KanbanBoard<Item>>> = {},
  dir?: 'rtl'
) {
  const onItemMove = vi.fn();
  const result = render(
    <div dir={dir}>
      <KanbanBoard<Item>
        columns={COLUMNS}
        renderCard={(item, index) => <p data-index={index}>{item.label}</p>}
        getItemId={item => item.id}
        onItemMove={onItemMove}
        enableVirtualization={false}
        {...props}
      />
    </div>
  );
  return { ...result, onItemMove };
}

/** A minimal DataTransfer: jsdom does not implement one. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key) ?? '',
  };
}

function column(title: string) {
  return screen.getByRole('group', { name: `${title} column items` });
}

describe('KanbanBoard certificate states', () => {
  it('names each column, shows its count and marks an accent', async () => {
    const { container } = renderBoard();
    expect(screen.getByRole('heading', { name: 'New' })).toBeInTheDocument();
    expect(
      within(column('New'))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(['First card', 'Second card']);
    expect(screen.getByText('First card')).toHaveAttribute('data-index', '0');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(
      container.querySelectorAll('span[aria-hidden="true"].rounded-full')
    ).toHaveLength(1);
    expect(within(column('Invited')).getByText('No items')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves a card when it is dragged to another column', () => {
    const { onItemMove } = renderBoard();
    const transfer = dataTransfer();
    const card = screen.getByText('First card').closest('li') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');

    fireEvent.dragStart(card, { dataTransfer: transfer });
    expect(transfer.effectAllowed).toBe('move');
    fireEvent.dragOver(column('Invited'), { dataTransfer: transfer });
    expect(transfer.dropEffect).toBe('move');
    fireEvent.drop(column('Invited'), { dataTransfer: transfer });

    expect(onItemMove).toHaveBeenCalledTimes(1);
    expect(onItemMove).toHaveBeenCalledWith('card-1', 'new', 'invited');
  });

  it('ignores a drop on the card’s own column and a drop with no card', () => {
    const { onItemMove } = renderBoard();
    const transfer = dataTransfer();
    fireEvent.dragStart(
      screen.getByText('Second card').closest('li') as HTMLElement,
      { dataTransfer: transfer }
    );
    fireEvent.drop(column('New'), { dataTransfer: transfer });
    fireEvent.drop(column('Invited'), { dataTransfer: dataTransfer() });
    expect(onItemMove).not.toHaveBeenCalled();
  });

  it('leaves cards fixed when no move handler is given', async () => {
    const { container } = renderBoard({ onItemMove: undefined });
    const card = screen.getByText('First card').closest('li') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'false');
    expect(card).not.toHaveClass('cursor-grab');
    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.drop(column('Invited'), { dataTransfer: transfer });
    await expectNoA11yViolations(container);
  });

  it('shows the caller empty line in each column and once for an empty board', async () => {
    const { container } = renderBoard({
      columns: [
        { id: 'new', title: 'New', items: [], count: 0 },
        { id: 'invited', title: 'Invited', items: [], count: 0 },
      ],
      emptyState: 'Nothing here yet',
    });
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(3);
    expect(screen.queryByText('No items')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('virtualizes a column with more than ten cards', () => {
    const { container } = renderBoard({
      enableVirtualization: true,
      columns: [
        {
          id: 'many',
          title: 'Many',
          items: Array.from({ length: 12 }, (_, index) => ({
            id: `card-${index}`,
            label: `Card ${index + 1}`,
          })),
          count: 12,
        },
      ],
    });
    const list = container.querySelector('ul');
    expect(list).toHaveClass('relative');
    expect(list).toHaveStyle({ height: `${12 * 130}px` });
  });

  it('keeps long titles and labels and stays axe clean right to left', async () => {
    const { container } = renderBoard(
      {
        columns: [
          {
            id: 'review',
            title: LONG_TITLE,
            items: [{ id: 'long', label: LONG_LABEL }],
            count: 1280,
          },
        ],
      },
      'rtl'
    );
    expect(
      screen.getByRole('heading', { name: LONG_TITLE })
    ).toBeInTheDocument();
    expect(screen.getByText(LONG_LABEL)).toBeInTheDocument();
    expect(screen.getByText('1280')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
