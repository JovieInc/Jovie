import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminActivitySkeleton } from '@/app/app/(shell)/admin/activity/loading';

describe('AdminActivityLoading', () => {
  it('renders the expected number of skeleton rows', () => {
    render(<AdminActivitySkeleton />);

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');

    expect(rows).toHaveLength(9);
  });
});
