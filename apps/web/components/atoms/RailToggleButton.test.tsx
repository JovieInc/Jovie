import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  IconButton: ({
    children,
    variant,
    size,
    ...props
  }: React.ComponentProps<'button'> & {
    readonly variant?: string;
    readonly size?: string;
  }) => (
    <button
      data-icon-button-variant={variant}
      data-icon-button-size={size}
      {...props}
    >
      {children}
    </button>
  ),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

import { RailToggleButton } from './RailToggleButton';

describe('RailToggleButton', () => {
  // ship-gate touch: keep colocated test in PR when component chrome changes
  it('uses one static chrome contract for a left rail', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(
      <RailToggleButton
        side='left'
        open
        openLabel='Collapse sidebar'
        closedLabel='Expand sidebar'
        onToggle={onToggle}
        dataTestId='left-toggle'
        iconTestId='left-icon'
      />
    );

    const button = screen.getByTestId('left-toggle');
    expect(button).toHaveAttribute('data-rail-toggle', 'left');
    expect(button).toHaveAttribute('data-icon-button-variant', 'railToggle');
    expect(button).toHaveAttribute('data-icon-button-size', 'sm');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).not.toHaveClass('aria-pressed:bg-interactive-active');
    expect(button.className).not.toContain('active:scale');
    expect(screen.getByTestId('left-icon')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('mirrors the same contract for a closed right rail', () => {
    render(
      <RailToggleButton
        side='right'
        open={false}
        openLabel='Hide profile'
        closedLabel='Show profile'
        onToggle={vi.fn()}
        dataTestId='right-toggle'
      />
    );

    const button = screen.getByTestId('right-toggle');
    expect(button).toHaveAttribute('data-rail-toggle', 'right');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', 'Show profile');
    expect(button).toHaveAttribute('data-icon-button-variant', 'railToggle');
    expect(button).toHaveAttribute('data-icon-button-size', 'sm');
  });
});
