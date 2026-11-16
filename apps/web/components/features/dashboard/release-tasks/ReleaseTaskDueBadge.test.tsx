import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';

const DAY_MS = 24 * 60 * 60 * 1000;

function fromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe('ReleaseTaskDueBadge', () => {
  it.each([
    ['a future date as days left', 14 * DAY_MS, '14d'],
    ['a date due soon as days left', 2 * DAY_MS, '2d'],
    ['a date due earlier today as Today', -60 * 60 * 1000, 'Today'],
    ['a recently missed date as Overdue', -5 * DAY_MS, 'Overdue'],
    ['a long-missed date as Overdue', -120 * DAY_MS, 'Overdue'],
  ])('shows %s', async (_label, offsetMs, text) => {
    const dueDate = fromNow(offsetMs);
    const { container } = render(
      <ReleaseTaskDueBadge dueDate={dueDate} dueDaysOffset={14} />
    );

    const badge = screen.getByText(text);
    expect(badge).toHaveAttribute('title', dueDate.toLocaleDateString());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('offers a Set date button when the task has an offset but no date', async () => {
    const user = userEvent.setup();
    const onSetDate = vi.fn();
    const { container } = render(
      <ReleaseTaskDueBadge
        dueDate={null}
        dueDaysOffset={-7}
        onSetDate={onSetDate}
      />
    );

    const button = screen.getByRole('button', { name: 'Set date' });
    await user.click(button);
    expect(onSetDate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders nothing with neither a date nor an offset', async () => {
    const { container } = render(
      <ReleaseTaskDueBadge dueDate={null} dueDaysOffset={null} />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders nothing once the task is completed', async () => {
    const { container } = render(
      <ReleaseTaskDueBadge
        dueDate={fromNow(-5 * DAY_MS)}
        dueDaysOffset={-5}
        isCompleted
      />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
