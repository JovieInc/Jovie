import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IconGlyphFrame } from './IconGlyphFrame';

describe('IconGlyphFrame certificate', () => {
  it('leaves focus with the enclosing control and carries the hover surface', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <button type='button' aria-label='Tickets'>
        <IconGlyphFrame
          hoverSurface='var(--color-surface-1)'
          className='text-warning'
          style={{ opacity: 0.5 }}
          aria-hidden
        >
          <svg aria-hidden='true' />
        </IconGlyphFrame>
      </button>
    );

    const button = screen.getByRole('button', { name: 'Tickets' });
    const glyph = button.querySelector('[data-icon-glyph]') as HTMLElement;
    expect(glyph).toHaveClass('icon-glyph', 'rounded-full', 'text-warning');
    expect(glyph.style.opacity).toBe('0.5');
    expect(glyph.style.getPropertyValue('--icon-glyph-hover-surface')).toBe(
      'var(--color-surface-1)'
    );

    await user.tab();
    expect(button).toHaveFocus();
    expect(glyph).not.toHaveAttribute('tabindex');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean beside text on an RTL page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <a href='/tickets'>
          <IconGlyphFrame aria-hidden>
            <svg aria-hidden='true' />
          </IconGlyphFrame>
          التذاكر
        </a>
      </div>
    );

    expect(screen.getByRole('link', { name: 'التذاكر' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
