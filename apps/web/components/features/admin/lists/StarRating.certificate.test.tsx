import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StarRating } from './StarRating';

function renderRating(
  props: Partial<React.ComponentProps<typeof StarRating>> = {},
  dir?: 'rtl'
) {
  const onChange = vi.fn();
  const result = render(
    <TooltipProvider>
      <div dir={dir}>
        <StarRating
          value={null}
          label='Rating for Ava'
          onChange={onChange}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
  return { ...result, onChange };
}

describe('StarRating certificate states', () => {
  it('offers five unpressed stars when there is no rating', async () => {
    const { container } = renderRating();
    const stars = screen.getAllByRole('button');
    expect(stars.map(star => star.getAttribute('aria-label'))).toEqual([
      'Rate 1 star',
      'Rate 2 stars',
      'Rate 3 stars',
      'Rate 4 stars',
      'Rate 5 stars',
    ]);
    for (const star of stars) {
      expect(star).toHaveAttribute('aria-pressed', 'false');
    }
    await expectNoA11yViolations(container);
  });

  it('rates by click and by keyboard', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRating();

    await user.click(screen.getByRole('button', { name: 'Rate 2 stars' }));
    expect(onChange).toHaveBeenLastCalledWith(2);

    screen.getByRole('button', { name: 'Rate 5 stars' }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(5);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('marks only the current star pressed and clears it on a second press', async () => {
    const user = userEvent.setup();
    const { container, onChange } = renderRating({ value: 3 });

    const current = screen.getByRole('button', { name: 'Clear 3-star rating' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Rate 2 stars' })
    ).toHaveAttribute('aria-pressed', 'false');
    await user.click(current);
    expect(onChange).toHaveBeenCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('ignores presses while disabled', async () => {
    const user = userEvent.setup();
    const { container, onChange } = renderRating({ value: 2, disabled: true });
    await user.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(onChange).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps its group name inside a right-to-left document', async () => {
    const { container } = renderRating(
      { value: 4, label: 'تقييم ليلى' },
      'rtl'
    );
    expect(screen.getByRole('group', { name: 'تقييم ليلى' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
