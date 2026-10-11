import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTableSkeleton } from './UnifiedTableSkeleton';

type Row = { id: string; title: string; count: number };

const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'title',
    id: 'title',
    header: 'Title',
  },
  {
    accessorKey: 'count',
    id: 'count',
    header: 'Count',
  },
];

describe('UnifiedTableSkeleton', () => {
  it('renders real header labels from the provided columns', () => {
    render(<UnifiedTableSkeleton columns={COLUMNS} skeletonRows={3} />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('reserves at least the requested skeleton rows plus the empty-state min-height', () => {
    const { container } = render(
      <UnifiedTableSkeleton columns={COLUMNS} skeletonRows={5} />
    );

    // Skeleton rows have fixed height and live inside <tbody>.
    // UnifiedTable reserves max(skeletonRows, ceil(220px / rowHeight)) rows
    // so loading → empty → populated transitions do not shift layout
    // (JOV-4869). Default rowHeight is 40px → ceil(220/40) = 6.
    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    const rows = tbody?.querySelectorAll('tr') ?? [];
    expect(rows.length).toBe(6);
  });

  it('renders one <td> per column on every skeleton row', () => {
    const { container } = render(
      <UnifiedTableSkeleton columns={COLUMNS} skeletonRows={2} />
    );

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach(row => {
      expect(row.querySelectorAll('td').length).toBe(COLUMNS.length);
    });
  });

  it('hides the header when hideHeader is true', () => {
    const { container } = render(
      <UnifiedTableSkeleton
        columns={COLUMNS}
        skeletonRows={1}
        hideHeader={true}
      />
    );

    expect(container.querySelector('thead')).toBeNull();
  });

  it('marks the table region as loading for assistive tech', () => {
    render(<UnifiedTableSkeleton columns={COLUMNS} skeletonRows={1} />);

    // The internal UnifiedTable emits a sr-only caption of "Loading table data"
    // when isLoading is true. This keeps the skeleton accessible.
    expect(screen.getByText('Loading table data')).toBeInTheDocument();
  });

  it('applies the loaded table row mode so two-line rows reserve their height', () => {
    const { container } = render(
      <UnifiedTableSkeleton
        columns={COLUMNS}
        skeletonRows={1}
        rowMode='two-line'
      />
    );

    const table = container.querySelector('table');
    expect(table?.style.getPropertyValue('--table-row-height')).toBe('56px');
    expect(table?.style.getPropertyValue('--table-cell-content-height')).toBe(
      '48px'
    );
  });

  it('reserves the people-row face and name for a person column', () => {
    const { container } = render(
      <UnifiedTableSkeleton
        columns={COLUMNS}
        skeletonRows={1}
        skeletonColumnConfig={[{ variant: 'person' }, { variant: 'text' }]}
      />
    );

    const firstCell = container.querySelector('tbody tr td');
    expect(
      firstCell?.querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
    expect(
      firstCell?.querySelector('.system-b-table-skeleton-person-name')
    ).not.toBeNull();
  });
});
