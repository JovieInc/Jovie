import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HoverReveal } from './hover-reveal';

describe('HoverReveal', () => {
  it('preserves a consumer action-slot identity on its own reserved box', () => {
    render(
      <HoverReveal
        data-slot='metadata-actions'
        data-testid='actions'
        className='flex shrink-0'
      >
        <button type='button'>Copy</button>
      </HoverReveal>
    );
    expect(screen.getByTestId('actions')).toHaveAttribute(
      'data-slot',
      'metadata-actions'
    );
    expect(screen.getByTestId('actions')).toHaveClass(
      'flex',
      'shrink-0',
      'opacity-0'
    );
  });

  it('retains the child box, keyboard access, and action at rest', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div className='group'>
        <HoverReveal asChild>
          <button type='button' onClick={onClick}>
            Copy
          </button>
        </HoverReveal>
      </div>
    );
    const action = screen.getByRole('button', { name: 'Copy' });
    expect(container.firstElementChild?.children).toHaveLength(1);
    expect(action).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    );
    expect(action).not.toHaveAttribute('aria-hidden');
    await userEvent.tab();
    expect(action).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps an engaged control visible after hover ends and restores the resting layer on release', () => {
    const { rerender } = render(
      <HoverReveal engaged data-testid='reveal'>
        Action
      </HoverReveal>
    );
    const reveal = screen.getByTestId('reveal');
    expect(reveal).toHaveClass('opacity-100');
    expect(reveal).not.toHaveClass('opacity-0');
    rerender(
      <HoverReveal inverse engaged data-testid='reveal'>
        1
      </HoverReveal>
    );
    expect(reveal).toHaveClass('opacity-0');
    expect(reveal).toHaveClass('group-focus-within:opacity-0');
    rerender(
      <HoverReveal inverse data-testid='reveal'>
        1
      </HoverReveal>
    );
    expect(reveal).toHaveClass('opacity-100');
  });

  it('retains focused, pressed and open-menu controls, with reduced-motion support', () => {
    render(
      <HoverReveal group='toolbar-filters' data-testid='reveal'>
        Action
      </HoverReveal>
    );
    expect(screen.getByTestId('reveal')).toHaveClass(
      'group-hover/toolbar-filters:opacity-100',
      'group-focus-within/toolbar-filters:opacity-100',
      'focus-within:opacity-100',
      'active:opacity-100',
      'has-aria-expanded:opacity-100',
      'has-aria-pressed:opacity-100',
      'motion-reduce:transition-none'
    );
  });
});
