import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachKpis } from './OutreachKpis';

const COUNTS = { email: 24, dm: 9, manualReview: 3, total: 36 };

describe('OutreachKpis', () => {
  it('shows each queue count under its title with the pipeline header', async () => {
    const { container } = render(<OutreachKpis counts={COUNTS} />);
    expect(screen.getByText('Outreach Pipeline')).toBeInTheDocument();
    expect(
      screen.getByText('Across email, DM, and manual-review queues')
    ).toBeInTheDocument();
    expect(screen.getByText('36 total')).toBeInTheDocument();
    for (const [title, value, note] of [
      ['Total Queued', '36', 'Across all queues'],
      ['Email Queue', '24', 'Ready for email outreach'],
      ['DM Queue', '9', 'Ready for DM outreach'],
      ['Manual Review', '3', 'Needs human review'],
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
      expect(screen.getByText(note)).toBeInTheDocument();
    }
    await expectNoA11yViolations(container);
  });

  it('renders only the metric grid when embedded', async () => {
    const { container } = render(<OutreachKpis counts={COUNTS} embedded />);
    expect(screen.queryByText('Outreach Pipeline')).toBeNull();
    expect(screen.queryByText('36 total')).toBeNull();
    expect(screen.getByText('Total Queued')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('grid');
    await expectNoA11yViolations(container);
  });

  it('prints very large counts in full', async () => {
    const { container } = render(
      <OutreachKpis
        counts={{
          email: 1_204_388,
          dm: 987_654,
          manualReview: 345_678,
          total: 2_537_720,
        }}
      />
    );
    expect(screen.getByText('2537720 total')).toBeInTheDocument();
    expect(screen.getByText('1204388')).toBeInTheDocument();
    expect(screen.getByText('345678')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OutreachKpis counts={COUNTS} />
      </div>
    );
    expect(within(container).getByText('Manual Review')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
