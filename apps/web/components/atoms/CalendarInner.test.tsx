import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import CalendarInner from './CalendarInner';

const JANUARY = new Date(2026, 0, 1, 12);

describe('CalendarInner', () => {
  it('names days by their plain number and selects one on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <CalendarInner mode='single' defaultMonth={JANUARY} onSelect={onSelect} />
    );

    const day = screen.getByRole('button', { name: /January 15/ });
    expect(day.getAttribute('aria-label')).not.toMatch(/15th/);
    await user.click(day);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as Date;
    expect(picked.getDate()).toBe(15);
    expect(picked.getMonth()).toBe(0);
    await expectNoA11yViolations(container);
  });

  it('moves between months with the previous and next buttons', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CalendarInner mode='single' defaultMonth={JANUARY} />
    );

    expect(
      screen.getByRole('grid', { name: /January 2026/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next month/i }));
    expect(
      screen.getByRole('grid', { name: /February 2026/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /previous month/i }));
    expect(
      screen.getByRole('grid', { name: /January 2026/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a two-month range and stays axe-clean in RTL', async () => {
    const { container, unmount } = render(
      <CalendarInner
        mode='range'
        numberOfMonths={2}
        defaultMonth={JANUARY}
        selected={{
          from: new Date(2026, 0, 24, 12),
          to: new Date(2026, 1, 9, 12),
        }}
      />
    );
    expect(screen.getAllByRole('grid')).toHaveLength(2);
    const february = screen.getByRole('grid', { name: /February 2026/ });
    expect(
      within(february).getByRole('button', { name: /February 9/ })
    ).toHaveAttribute('aria-label', expect.stringMatching(/selected/i));
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <CalendarInner mode='single' dir='rtl' defaultMonth={JANUARY} />
      </div>
    );
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
