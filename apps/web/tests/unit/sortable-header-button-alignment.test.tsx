import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableHeaderButton as AdminSortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import { SortableHeaderButton as TableSortableHeaderButton } from '@/components/organisms/table/SortableHeaderButton';

describe('SortableHeaderButton alignment', () => {
  it('uses a consistent icon+label gap in admin tables', () => {
    render(
      <AdminSortableHeaderButton
        label='Name'
        onClick={vi.fn()}
        direction='asc'
      />
    );

    expect(screen.getByRole('button', { name: /name/i }).className).toContain(
      'gap-2'
    );
  });

  it('uses a consistent icon+label gap in shared tables', () => {
    render(<TableSortableHeaderButton label='Status' onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /status/i }).className).toContain(
      'gap-2'
    );
  });
});
