import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';

function tourDate(
  overrides: Partial<OpportunityInboxTourDateItem> = {}
): OpportunityInboxTourDateItem {
  return {
    id: 'tour-date-1',
    title: 'The Troubadour, Los Angeles',
    startDate: '2026-11-05',
    startTime: '20:00',
    venueName: 'The Troubadour',
    location: 'Los Angeles, CA',
    providerLabel: 'Bandsintown',
    status: 'pending',
    ...overrides,
  };
}

describe('OpportunityInboxTourDateRow', () => {
  it('renders the title and metadata line for a pending item', () => {
    render(<OpportunityInboxTourDateRow item={tourDate()} />);
    expect(screen.getByText('The Troubadour, Los Angeles')).toBeInTheDocument();
    expect(
      screen.getByText(/The Troubadour, Los Angeles, CA/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm Tour Date' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reject Tour Date' })
    ).toBeInTheDocument();
  });

  // JOV-8964: the pending status dot and confirm ring are neutral
  // design-system tokens — never the loud accent-orange.
  it('renders the pending status dot and confirm ring in the neutral token', () => {
    const { container } = render(
      <OpportunityInboxTourDateRow item={tourDate()} />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute('data-status', 'pending');
    const dot = container.querySelector<HTMLSpanElement>('[aria-hidden]');
    expect(dot?.getAttribute('style')).toContain(
      'var(--color-text-secondary-token)'
    );
    expect(dot?.getAttribute('style')).not.toContain('accent-orange');
    const confirm = screen.getByRole('button', { name: 'Confirm Tour Date' });
    expect(confirm.getAttribute('style')).toContain(
      'var(--color-text-secondary-token)'
    );
    expect(confirm.getAttribute('style')).not.toContain('accent-orange');
  });

  it('renders the confirmed state with a persistent ring and no dismiss', () => {
    render(
      <OpportunityInboxTourDateRow item={tourDate({ status: 'confirmed' })} />
    );
    expect(screen.getByRole('button', { name: 'Confirmed' })).toHaveAttribute(
      'style',
      expect.stringContaining('var(--color-accent-green)')
    );
    expect(
      screen.queryByRole('button', { name: 'Reject Tour Date' })
    ).not.toBeInTheDocument();
  });

  it('renders the rejected state without action chrome', () => {
    render(
      <OpportunityInboxTourDateRow item={tourDate({ status: 'rejected' })} />
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm Tour Date' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject Tour Date' })
    ).not.toBeInTheDocument();
  });
});
