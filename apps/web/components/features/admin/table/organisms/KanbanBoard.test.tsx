import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanBoard } from './KanbanBoard';

describe('KanbanBoard', () => {
  it('renders named columns and card content', () => {
    render(
      <KanbanBoard
        columns={[
          {
            id: 'new',
            title: 'New',
            items: [{ id: 'card-1', label: 'First card' }],
            count: 1,
          },
        ]}
        renderCard={item => <p>{item.label}</p>}
        getItemId={item => item.id}
        enableVirtualization={false}
      />
    );

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('First card')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('draws each column on the approved nested surface', () => {
    const { container } = render(
      <KanbanBoard
        columns={[{ id: 'new', title: 'New', items: [], count: 0 }]}
        renderCard={() => null}
        getItemId={(item: { id: string }) => item.id}
        enableVirtualization={false}
      />
    );

    const column = screen.getByText('New').closest('.bg-surface-0');
    expect(column).not.toBeNull();
    expect(container.innerHTML).not.toContain('color-mix');
  });
});
