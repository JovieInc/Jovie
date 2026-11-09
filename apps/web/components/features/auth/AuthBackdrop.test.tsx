import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthBackdrop } from './AuthBackdrop';

describe('AuthBackdrop', () => {
  it('is decorative, inert and painted from theme tokens in its stylesheet', async () => {
    const { container } = render(<AuthBackdrop />);
    const backdrop = container.querySelector('[data-auth-backdrop]');

    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveClass('pointer-events-none', 'fixed', '-z-10');
    const layers = Array.from(backdrop?.children ?? []);
    expect(layers.map(layer => layer.className)).toEqual([
      'auth-backdrop-glow absolute inset-0',
      'auth-backdrop-veil absolute inset-0',
    ]);

    const css = readFileSync(`${__dirname}/AuthBackdrop.css`, 'utf8');
    expect(css).toContain('118% -8%');
    expect(css).toContain('-8% 116%');
    expect(css).toContain('var(--color-accent)');
    expect(css).toContain('var(--color-bg-base)');
    expect(css).not.toMatch(/rgb\(|#[0-9a-f]{3,8}\b/i);

    await expectNoA11yViolations(container);
  });
});
