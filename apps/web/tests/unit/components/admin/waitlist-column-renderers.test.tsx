import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  renderEmailCell,
  renderHeardAboutCell,
  renderNameCell,
  renderStatusCell,
} from '@/features/admin/waitlist-table/utils/column-renderers';

describe('waitlist column renderers', () => {
  it('renders name and email cells with canonical table tokens', () => {
    const { rerender } = render(renderNameCell('Ari Lane'));

    expect(screen.getByText('Ari Lane').className).toContain(
      'text-primary-token'
    );

    rerender(renderEmailCell('ari@example.com'));

    const emailLink = screen.getByRole('link', { name: 'ari@example.com' });
    expect(emailLink.className).toContain('text-secondary-token');
    expect(emailLink).toHaveAttribute('href', 'mailto:ari@example.com');
  });

  it('renders heard-about cells with secondary text and a tertiary empty state', () => {
    const { rerender } = render(renderHeardAboutCell('Instagram'));

    expect(screen.getByText('Instagram').className).toContain(
      'text-secondary-token'
    );

    rerender(renderHeardAboutCell(null));

    expect(screen.getByText('—').className).toContain('text-tertiary-token');
  });

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
