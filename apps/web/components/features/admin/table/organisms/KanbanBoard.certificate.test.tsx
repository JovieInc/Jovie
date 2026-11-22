import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { KanbanBoard } from './KanbanBoard';

interface Item {
  id: string;
  label: string;
}

const renderCard = (item: Item) => <p>{item.label}</p>;
const getItemId = (item: Item) => item.id;

describe('KanbanBoard certificate', () => {
  it('renders columns and cards axe-clean', async () => {
    const { container } = render(
      <KanbanBoard<Item>
        columns={[
          {
            id: 'new',
            title: 'New',
            items: [{ id: '1', label: 'First' }],
            count: 1,
          },
          { id: 'done', title: 'Done', items: [], count: 0 },
        ]}
        renderCard={renderCard}
        getItemId={getItemId}
        enableVirtualization={false}
      />
    );
    expect(screen.getByText('First')).toBeVisible();
    expect(screen.getByText('Done')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty state for empty columns axe-clean', async () => {
    const { container } = render(
      <KanbanBoard<Item>
        columns={[{ id: 'new', title: 'New', items: [], count: 0 }]}
        renderCard={renderCard}
        getItemId={getItemId}
        emptyState={<p>Nothing here</p>}
        enableVirtualization={false}
      />
    );
    expect(screen.getAllByText('Nothing here').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('shows the full count when more items exist than are loaded', async () => {
    const { container } = render(
      <KanbanBoard<Item>
        columns={[
          {
            id: 'new',
            title: 'New',
            items: [{ id: '1', label: 'First' }],
            count: 40,
          },
        ]}
        renderCard={renderCard}
        getItemId={getItemId}
        enableVirtualization={false}
      />
    );
    expect(screen.getByText('40')).toBeVisible();
    expect(screen.getAllByText('First')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
