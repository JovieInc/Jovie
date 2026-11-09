import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthBackdrop } from './AuthBackdrop';

describe('AuthBackdrop', () => {
  it('is decorative, inert and painted from theme tokens', async () => {
    const { container } = render(<AuthBackdrop />);
    const backdrop = container.querySelector('[data-auth-backdrop]');

    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveClass('pointer-events-none', 'fixed', '-z-10');
    const layers = Array.from(backdrop?.children ?? []) as HTMLElement[];
    expect(layers).toHaveLength(2);
    const [glow, veil] = layers.map(layer => layer.style.backgroundImage);
    expect(glow).toContain('var(--color-accent)');
    expect(glow).toContain('118% -8%');
    expect(glow).toContain('-8% 116%');
    expect(veil).toContain('var(--color-bg-base)');
    expect(`${glow}${veil}`).not.toMatch(/rgb\(|#[0-9a-f]{3,8}/i);

    await expectNoA11yViolations(container);
  });
});
