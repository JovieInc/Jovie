import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderStatusCell } from '@/components/admin/waitlist-table/utils/column-renderers';

describe('renderStatusCell', () => {
  it.each([
    ['new', 'New', 'bg-btn-primary'],
    ['invited', 'Invited', 'border-amber-500/20'],
    ['claimed', 'Claimed', 'border-emerald-500/20'],
  ] as const)('renders %s as a small badge with consistent table sizing', (status, label, expectedClassToken) => {
    render(renderStatusCell(status));

    const badge = screen.getByText(label);

    expect(badge.className).toContain('text-[10px]');
    expect(badge.className).toContain(expectedClassToken);
  });
});
