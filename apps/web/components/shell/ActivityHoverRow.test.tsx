import { fireEvent, render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityHoverRow } from './ActivityHoverRow';

describe('ActivityHoverRow', () => {
  it('renders the label, meta, and icon', () => {
    render(
      <ActivityHoverRow
        icon={Sparkles}
        label='Canvas regenerated'
        meta='2m ago'
      />
    );
    expect(screen.getByText('Canvas regenerated')).toBeInTheDocument();
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('shows the running indicator only when running is true', () => {
    const { container, rerender } = render(
      <ActivityHoverRow icon={Sparkles} label='L' meta='M' />
    );
    expect(container.querySelector('.anim-calm-breath')).toBeNull();
    rerender(<ActivityHoverRow icon={Sparkles} label='L' meta='M' running />);
    expect(container.querySelector('.anim-calm-breath')).not.toBeNull();
  });

  it('applies the danger tone classes when danger is set', () => {
    const { container } = render(
      <ActivityHoverRow
        icon={Sparkles}
        label='Deleted release'
        meta='now'
        danger
      />
    );
    expect(container.firstElementChild?.className).toContain('rose');
  });

  it('fires onClick when the row is clicked', () => {
    const onClick = vi.fn();
    render(
      <ActivityHoverRow icon={Sparkles} label='L' meta='M' onClick={onClick} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
