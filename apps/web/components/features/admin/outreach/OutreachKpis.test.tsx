import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutreachKpis } from './OutreachKpis';

const counts = { email: 4, dm: 2, manualReview: 0, total: 6 };

function manualReviewIcon(container: HTMLElement) {
  const card = screen
    .getByText('Manual Review')
    .closest('div[class*="rounded"]');
  return (card ?? container).querySelector('svg');
}

describe('OutreachKpis', () => {
  it('renders every queue count', () => {
    render(<OutreachKpis counts={counts} embedded />);

    expect(screen.getByText('Total Queued')).toBeInTheDocument();
    expect(screen.getByText('Email Queue')).toBeInTheDocument();
    expect(screen.getByText('DM Queue')).toBeInTheDocument();
    expect(screen.getByText('Needs human review')).toBeInTheDocument();
  });

  it('flags Manual Review with the warning token only when items wait', () => {
    const { container, rerender } = render(
      <OutreachKpis counts={{ ...counts, manualReview: 3 }} embedded />
    );
    expect(manualReviewIcon(container)).toHaveClass('text-warning-text');

    rerender(<OutreachKpis counts={counts} embedded />);
    const icon = manualReviewIcon(container);
    expect(icon).toHaveClass('text-tertiary-token');
    expect(icon).not.toHaveClass('text-warning-text');
  });
});
