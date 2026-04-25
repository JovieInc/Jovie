import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnifiedTableSkeleton } from './UnifiedTableSkeleton';

type Row = { id: string; title: string; count: number };

const columnHelper = createColumnHelper<Row>();

// biome-ignore lint/suspicious/noExplicitAny: columnHelper.accessor narrows per-column types; outer array must be widened in test fixtures.
const COLUMNS: ColumnDef<Row, any>[] = [
  columnHelper.accessor('title', {
    id: 'title',
    header: 'Title',
  }),
  columnHelper.accessor('count', {
    id: 'count',
    header: 'Count',
  }),
];

describe('UnifiedTableSkeleton', () => {
  it('renders real header labels from the provided columns', () => {
    render(<UnifiedTableSkeleton columns={COLUMNS} skeletonRows={3} />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('renders the requested number of skeleton rows', () => {
    const { container } = render(
      <UnifiedTableSkeleton columns={COLUMNS} skeletonRows={5} />
    );

    // Skeleton rows have fixed height and live inside <tbody>
    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    const rows = tbody?.querySelectorAll('tr') ?? [];
    expect(rows.length).toBe(5);
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
});
