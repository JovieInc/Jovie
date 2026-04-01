import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderStatusCell } from '@/features/admin/waitlist-table/utils/column-renderers';

describe('renderStatusCell', () => {
  it.each([
    ['new', 'New', 'bg-(--color-bg-primary)'],
    ['invited', 'Invited', 'bg-(--color-warning-subtle)'],
    ['claimed', 'Claimed', 'bg-(--color-success-subtle)'],
  ] as const)('renders %s as a small badge with consistent table sizing', (status, label, expectedClassToken) => {
    render(renderStatusCell(status));

    const badge = screen.getByText(label);

    expect(badge.className).toContain('text-[10px]');
    expect(badge.className).toContain(expectedClassToken);
  });
});
