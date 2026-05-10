import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderStatusCell } from '@/features/admin/waitlist-table/utils/column-renderers';

describe('renderStatusCell', () => {
  it.each([
    ['new', 'Waitlisted', 'text-(--linear-text-tertiary)'],
    ['chat_started', 'Chat started', 'text-(--linear-text-tertiary)'],
    ['qualified', 'Qualified', 'text-(--linear-text-tertiary)'],
    ['waitlisted', 'Waitlisted', 'text-(--linear-text-tertiary)'],
    ['invited', 'Invited', 'text-(--linear-text-primary)'],
    ['approved', 'Approved', 'text-(--linear-text-primary)'],
    ['claimed', 'Signed up', 'bg-(--color-success-subtle)'],
    ['signed_up', 'Signed up', 'bg-(--color-success-subtle)'],
    ['rejected', 'Rejected', 'bg-(--color-error-subtle)'],
    ['expired', 'Expired', 'bg-(--color-warning-subtle)'],
    ['blocked', 'Blocked', 'bg-(--color-error-subtle)'],
  ] as const)('renders %s as a small badge with consistent table sizing', (status, label, expectedClassToken) => {
    render(renderStatusCell(status));

    const badge = screen.getByText(label);

    expect(badge.className).toContain('text-[10px]');
    expect(badge.className).toContain(expectedClassToken);
  });
});
