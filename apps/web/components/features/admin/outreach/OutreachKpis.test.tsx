import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachKpis } from './OutreachKpis';

const counts = { email: 24, dm: 9, manualReview: 3, total: 36 };

function manualReviewIcon(container: HTMLElement) {
  const card = screen
    .getByText('Manual Review')
    .closest('div[class*="rounded"]');
  return (card ?? container).querySelector('svg');
}

describe('OutreachKpis', () => {
  it('renders the pipeline card with all four counts', async () => {
    const { container } = render(<OutreachKpis counts={counts} />);
    expect(screen.getByText('Outreach Pipeline')).toBeInTheDocument();
    expect(screen.getByText('36 total')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders only the tile grid when embedded', async () => {
    const { container } = render(<OutreachKpis counts={counts} embedded />);
    expect(screen.queryByText('Outreach Pipeline')).not.toBeInTheDocument();
    expect(screen.getByText('Email Queue')).toBeInTheDocument();
    expect(screen.getByText('Manual Review')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders zero counts as zeros', async () => {
    const { container } = render(
      <OutreachKpis
        counts={{ email: 0, dm: 0, manualReview: 0, total: 0 }}
        embedded
      />
    );
    expect(screen.getAllByText('0')).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('flags Manual Review with the warning token only when items wait', () => {
    const { container, rerender } = render(
      <OutreachKpis counts={counts} embedded />
    );
    expect(manualReviewIcon(container)).toHaveClass('text-warning-text');

    rerender(<OutreachKpis counts={{ ...counts, manualReview: 0 }} embedded />);
    const icon = manualReviewIcon(container);
    expect(icon).toHaveClass('text-tertiary-token');
    expect(icon).not.toHaveClass('text-warning-text');
  });
});
