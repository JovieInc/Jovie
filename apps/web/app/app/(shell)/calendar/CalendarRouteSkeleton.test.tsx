import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CalendarRouteSkeleton } from './CalendarRouteSkeleton';

describe('CalendarRouteSkeleton', () => {
  it('announces one busy Calendar region shaped like the month view, axe-clean', async () => {
    const { container } = render(<CalendarRouteSkeleton />);

    const region = screen.getByLabelText('Loading Calendar');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');

    const rail = screen.getByTestId('calendar-filter-rail-skeleton');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail.children).toHaveLength(4);

    const grid = screen.getByTestId('calendar-grid-skeleton');
    const [weekdays, cells] = Array.from(grid.children);
    expect(weekdays.children).toHaveLength(7);
    // Six weeks of seven days, so no month needs the grid to grow.
    expect(cells.children).toHaveLength(42);
    expect(within(grid).queryByText(/\S/)).not.toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('keeps the same skeleton under a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CalendarRouteSkeleton />
      </div>
    );
    expect(screen.getByLabelText('Loading Calendar')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
