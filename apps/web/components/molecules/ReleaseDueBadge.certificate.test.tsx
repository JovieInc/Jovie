import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseDueBadge, ReleaseDueClockContext } from './ReleaseDueBadge';

const NOW = new Date('2030-05-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function withClock(node: ReactNode) {
  return (
    <ReleaseDueClockContext.Provider value={NOW}>
      {node}
    </ReleaseDueClockContext.Provider>
  );
}

describe('ReleaseDueBadge certificate', () => {
  it('asks for a date when only an offset is known', async () => {
    const user = userEvent.setup();
    const onSetDate = vi.fn();
    const { container } = render(
      withClock(
        <ReleaseDueBadge
          dueDate={null}
          dueDaysOffset={7}
          onSetDate={onSetDate}
        />
      )
    );
    const setDate = screen.getByRole('button', { name: 'Set date' });
    expect(setDate).toHaveClass('text-warning');

    await user.click(setDate);

    expect(onSetDate).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('renders nothing without a date or offset, or once completed', () => {
    const { container, rerender } = render(
      withClock(<ReleaseDueBadge dueDate={null} dueDaysOffset={null} />)
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      withClock(
        <ReleaseDueBadge
          dueDate={new Date(NOW.getTime() + 2 * DAY)}
          dueDaysOffset={2}
          isCompleted
        />
      )
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [-5, 'Overdue'],
    [-200, 'Overdue'],
    [0, 'Today'],
    [2, '2d'],
    [1200, '1200d'],
  ])('labels a due date %i days out as %s', async (days, label) => {
    const { container } = render(
      withClock(
        <ReleaseDueBadge
          dueDate={new Date(NOW.getTime() + days * DAY)}
          dueDaysOffset={days}
        />
      )
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders right to left without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        {withClock(
          <ReleaseDueBadge
            dueDate={new Date(NOW.getTime() + 2 * DAY)}
            dueDaysOffset={2}
          />
        )}
      </div>
    );
    expect(screen.getByText('2d')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
