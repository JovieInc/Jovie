import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerChangelogMonthGroup } from '@/lib/customer-changelog';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';

const MONTHS: readonly CustomerChangelogMonthGroup[] = [
  {
    monthKey: '2026-08',
    label: 'August 2026',
    entries: [
      {
        title: 'Review qualified brand deals in your Inbox',
        slug: 'review-qualified-brand-deals-v26-8-1-0',
        date: '2026-08-16',
        summary: 'See the buyer, budget, and source.',
        category: 'new',
        capabilities: ['inbox'],
        surfaces: [],
        availability: 'ga',
        media: null,
        technicalVersion: '26.8.1',
        explanation: 'See the buyer, budget, and source.',
        supporting: [],
        technical: [],
        prominence: 'featured',
      },
    ],
  },
  {
    monthKey: '2026-07',
    label: 'July 2026',
    entries: [
      {
        title: 'Sign-out stays available when the store is missing',
        slug: 'sign-out-stays-available-v26-7-0-0',
        date: '2026-07-21',
        summary: 'Customer sessions can still leave.',
        category: 'fixed',
        capabilities: [],
        surfaces: [],
        availability: 'ga',
        media: null,
        technicalVersion: '26.7.0',
        explanation: 'Customer sessions can still leave.',
        supporting: [],
        technical: ['JOV-5260', 'Redis', 'admission'],
        prominence: 'small',
      },
    ],
  },
];

describe('CustomerChangelogArchive', () => {
  it('leads with outcome titles and keeps version tertiary', () => {
    render(<CustomerChangelogArchive months={MONTHS.slice(0, 1)} />);

    expect(
      screen.getByRole('heading', {
        name: 'Review qualified brand deals in your Inbox',
      })
    ).toBeVisible();
    expect(screen.getByText('August 16, 2026 · v26.8.1')).toBeVisible();
    expect(
      screen.getByText('August 16, 2026 · v26.8.1').closest('a')
    ).toHaveAttribute('href', '/changelog/26.8.1');
    expect(screen.queryByText(/^v26\.8\.1$/)).not.toBeInTheDocument();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows one month then loads earlier updates without 1-of-N theater', () => {
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    expect(screen.getByText('August 2026')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'August 2026' })).toHaveClass(
      'truncate'
    );
    expect(screen.queryByText('July 2026')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    ).toBeVisible();
    expect(screen.queryByText(/Show \d+ More/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of \d+/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Load Earlier Updates' })
    );

    expect(screen.getByText('July 2026')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load Earlier Updates' })
    ).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('keeps JOV-IDs, Redis, and admission on Level 3', () => {
    render(<CustomerChangelogArchive months={MONTHS.slice(1)} />);

    expect(
      screen.getByRole('heading', {
        name: 'Sign-out stays available when the store is missing',
      })
    ).toBeVisible();
    const disclosure = screen.getByText('Technical details').closest('details');
    expect(disclosure).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('Technical details'));

    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByText(/JOV-5260/)).toBeVisible();
    expect(screen.getByText(/Redis/)).toBeVisible();
    expect(screen.getByText(/admission/)).toBeVisible();
  });

  it('renders the empty state without archive chrome', () => {
    render(<CustomerChangelogArchive months={[]} />);

    expect(screen.getByText('No updates yet. Check back soon!')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load Earlier Updates' })
    ).not.toBeInTheDocument();
  });
});
