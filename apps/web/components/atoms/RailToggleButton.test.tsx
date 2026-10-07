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
    expect(button).toHaveAttribute('data-icon-button-variant', 'secondary');
    expect(button).toHaveAttribute('data-icon-button-size', 'sm');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).not.toContain('aria-pressed:bg-');
    expect(button).toHaveClass(
      'bg-transparent',
      'focus-visible:bg-transparent'
    );
    expect(button.className).not.toContain('active:scale');
    expect(screen.getByTestId('left-icon')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('exposes preview visibility separately from saved pin state', () => {
    render(
      <RailToggleButton
        side='right'
        open
        pinned={false}
        controlsId='profile-rail'
        openLabel='Pin profile'
        closedLabel='Show profile'
        onToggle={vi.fn()}
      />
    );
    const button = screen.getByRole('button', { name: 'Pin profile' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-controls', 'profile-rail');
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
    expect(button).toHaveAttribute('data-icon-button-variant', 'secondary');
    expect(button).toHaveAttribute('data-icon-button-size', 'sm');
  });

  it.each([
    ['left', true, 'lucide-rail-left-open'],
    ['left', false, 'lucide-rail-left-closed'],
    ['right', true, 'lucide-rail-right-open'],
    ['right', false, 'lucide-rail-right-closed'],
  ] as const)(
    'draws the %s rail (open=%s) from the Jovie rail family',
    (side, open, glyph) => {
      render(
        <RailToggleButton
          side={side}
          open={open}
          openLabel='Hide'
          closedLabel='Show'
          onToggle={vi.fn()}
          dataTestId='toggle'
          iconTestId='toggle-icon'
        />
      );

      const icon = screen.getByTestId('toggle-icon');
      expect(icon.getAttribute('class')).toContain(glyph);
      expect(icon.getAttribute('class')).not.toMatch(/lucide-(panel|chevron)-/);
    }
  );
});
