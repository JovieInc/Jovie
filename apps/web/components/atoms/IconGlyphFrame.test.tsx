import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconGlyphFrame } from './IconGlyphFrame';

describe('IconGlyphFrame', () => {
  it('leaves focus and action semantics with its enclosing control', () => {
    render(
      <button type='button' aria-label='Tickets'>
        <IconGlyphFrame hoverSurface='var(--color-surface-1)' aria-hidden>
          <svg />
        </IconGlyphFrame>
      </button>
    );
    const button = screen.getByRole('button', { name: 'Tickets' });
    const glyph = button.querySelector('[data-icon-glyph]')!;
    expect(glyph).toHaveClass('rounded-full', 'size-7');
    expect(glyph).not.toHaveAttribute('tabindex');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph).not.toHaveAttribute('role');
    expect(button).toHaveAccessibleName('Tickets');
  });
});
