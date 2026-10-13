import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('rates, and choosing the current rating clears it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StarRating value={null} onChange={onChange} label='Rating for Ava' />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    rerender(
      <StarRating value={4} onChange={onChange} label='Rating for Ava' />
    );
    const current = screen.getByRole('button', { name: 'Clear 4-star rating' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(current);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('names the group and disables every star while busy', () => {
    render(
      <StarRating value={2} onChange={vi.fn()} label='Rating for Bo' disabled />
    );
    expect(screen.getByRole('group', { name: 'Rating for Bo' })).toBeVisible();
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
    for (const star of stars) expect(star).toBeDisabled();
  });
});
