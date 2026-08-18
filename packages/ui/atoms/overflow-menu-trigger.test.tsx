import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OverflowMenuTrigger } from './overflow-menu-trigger';

describe('OverflowMenuTrigger', () => {
  it('renders a button with a safe default label and type', () => {
    render(<OverflowMenuTrigger />);

    const trigger = screen.getByRole('button', { name: 'More tabs' });
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).not.toHaveAttribute('data-active-overflow');
  });

  it('communicates when the current tab is hidden in overflow', () => {
    const { container } = render(<OverflowMenuTrigger hasActiveOverflow />);

    const trigger = screen.getByRole('button', {
      name: 'More tabs, current tab hidden',
    });
    expect(trigger).toHaveAttribute('data-active-overflow', 'true');
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('preserves an explicit accessible label', () => {
    render(
      <OverflowMenuTrigger
        hasActiveOverflow
        aria-label='More profile sections'
      />
    );

    expect(
      screen.getByRole('button', { name: 'More profile sections' })
    ).toBeInTheDocument();
  });

  it('applies drawer and segment variants', () => {
    const { rerender } = render(
      <OverflowMenuTrigger variant='drawer' aria-label='Drawer overflow' />
    );
    expect(screen.getByRole('button')).toHaveClass('min-h-7', 'px-2');

    rerender(
      <OverflowMenuTrigger variant='segment' aria-label='Segment overflow' />
    );
    expect(screen.getByRole('button')).toHaveClass('h-7', 'px-2');
  });

  it('uses a 44px target and reduced-motion-safe interaction tokens', () => {
    render(<OverflowMenuTrigger />);
    const trigger = screen.getByRole('button');

    expect(trigger.className).toContain('before:h-11');
    expect(trigger.className).toContain('before:min-w-11');
    expect(trigger.className).toContain('duration-subtle');
    expect(trigger.className).toContain('ease-subtle');
    expect(trigger.className).toContain('motion-reduce:transition-none');
  });

  it('forwards refs, custom classes, and click behavior', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = React.createRef<HTMLButtonElement>();
    render(
      <OverflowMenuTrigger
        ref={ref}
        className='custom-trigger'
        onClick={onClick}
      />
    );

    const trigger = screen.getByRole('button');
    expect(ref.current).toBe(trigger);
    expect(trigger).toHaveClass('custom-trigger');
    await user.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
