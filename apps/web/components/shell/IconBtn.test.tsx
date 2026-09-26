import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconBtn } from './IconBtn';

describe('IconBtn', () => {
  it('renders an accessible icon button labelled by the tooltip label', () => {
    render(
      <IconBtn label='Lyrics'>
        <span data-testid='icon-glyph' />
      </IconBtn>
    );

    const button = screen.getByRole('button', { name: 'Lyrics' });
    expect(button).toContainElement(screen.getByTestId('icon-glyph'));
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(
      <IconBtn label='Lyrics' onClick={onClick}>
        <span />
      </IconBtn>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lyrics' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('forwards intent signals on hover and focus', () => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    render(
      <IconBtn label='Lyrics' onMouseEnter={onMouseEnter} onFocus={onFocus}>
        <span />
      </IconBtn>
    );

    const button = screen.getByRole('button', { name: 'Lyrics' });
    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    expect(onMouseEnter).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('applies the ghost active treatment', () => {
    render(
      <IconBtn label='Lyrics' tone='ghost' active>
        <span />
      </IconBtn>
    );

    const button = screen.getByRole('button', { name: 'Lyrics' });
    expect(button.className).toContain('bg-surface-1/40');
    expect(button.className).toContain('rounded-full');
  });
});
