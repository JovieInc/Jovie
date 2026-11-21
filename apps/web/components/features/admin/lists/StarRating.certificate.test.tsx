import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StarRating } from './StarRating';

describe('StarRating certificate', () => {
  it('rates on click and stays axe-clean when unrated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <StarRating value={null} onChange={onChange} label='Rating' />
    );
    await user.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
    await expectNoA11yViolations(container);
  });

  it('clears the rating when the current star is chosen again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <StarRating value={3} onChange={onChange} label='Rating' />
    );
    const current = screen.getByRole('button', { name: 'Clear 3-star rating' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    await user.click(current);
    expect(onChange).toHaveBeenCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <StarRating value={2} onChange={onChange} label='Rating' disabled />
    );
    await user.click(screen.getByRole('button', { name: 'Rate 5 stars' }));
    expect(onChange).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
