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

  it('preserves drawer and segment semantics on canonical geometry', () => {
    const { rerender } = render(
      <OverflowMenuTrigger variant='drawer' aria-label='Drawer overflow' />
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-overflow-context',
      'drawer'
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'icon-sm');

    rerender(
      <OverflowMenuTrigger variant='segment' aria-label='Segment overflow' />
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-overflow-context',
      'segment'
    );
    expect(screen.getByRole('button')).toHaveClass('h-7', 'w-7');
  });

  it('inherits the 44px target and interaction states from IconButton', () => {
    render(<OverflowMenuTrigger />);
    const trigger = screen.getByRole('button');

    expect(trigger.className).toContain('before:h-11');
    expect(trigger.className).toContain('before:w-11');
    expect(trigger.className).toContain('duration-subtle');
    expect(trigger.className).toContain('ease-subtle');
    expect(trigger.className).toContain('motion-reduce:transition-none');
    expect(trigger.className).toContain('hover:bg-interactive-hover');
    expect(trigger.className).toContain('focus-visible:bg-interactive-hover');
    expect(trigger.className).toContain('active:bg-interactive-active');
    expect(trigger.className).toContain(
      'data-[state=open]:bg-interactive-active'
    );
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
