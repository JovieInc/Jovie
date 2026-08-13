import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableHeaderButton as AdminSortableHeaderButton } from '@/components/features/admin/table';
import { SortableHeaderButton as TableSortableHeaderButton } from '@/components/organisms/table/SortableHeaderButton';

describe('SortableHeaderButton alignment', () => {
  it('keeps the deprecated admin import path on the canonical owner', () => {
    expect(AdminSortableHeaderButton).toBe(TableSortableHeaderButton);
  });

  it('uses a consistent icon+label gap in admin tables', () => {
    render(
      <AdminSortableHeaderButton
        label='Name'
        onClick={vi.fn()}
        direction='asc'
      />
    );

    expect(
      screen.getByRole('button', { name: /name/i }).querySelector('span.gap-2')
    ).toBeInTheDocument();
  });

  it('uses a consistent icon+label gap in shared tables', () => {
    render(<TableSortableHeaderButton label='Status' onClick={vi.fn()} />);

    expect(
      screen
        .getByRole('button', { name: /status/i })
        .querySelector('span.gap-2')
    ).toBeInTheDocument();
  });
});
