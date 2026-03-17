import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderStatusCell } from '@/features/admin/waitlist-table/utils/column-renderers';

describe('renderStatusCell', () => {
  it.each([
    ['new', 'New', 'bg-(--linear-bg-surface-2)'],
    ['invited', 'Invited', 'bg-(--linear-warning)/15'],
    ['claimed', 'Claimed', 'bg-(--linear-success)/15'],
  ] as const)('renders %s as a small badge with consistent table sizing', (status, label, expectedClassToken) => {
    render(renderStatusCell(status));

    const badge = screen.getByText(label);

    expect(badge.className).toContain('text-[10px]');
    expect(badge.className).toContain(expectedClassToken);
  });
});
