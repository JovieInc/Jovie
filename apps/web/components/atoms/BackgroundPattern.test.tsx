import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BACKGROUND_PATTERNS, BackgroundPattern } from './BackgroundPattern';

describe('BackgroundPattern', () => {
  it.each([
    [
      'grid',
      '--background-pattern-grid',
      '--background-pattern-grid-dark',
      'bg-[size:50px_50px]',
    ],
    [
      'dots',
      '--background-pattern-dots',
      '--background-pattern-dots-dark',
      'bg-[size:20px_20px]',
    ],
  ] as const)(
    'draws the %s pattern from its light and dark tokens',
    async (variant, light, dark, size) => {
      const { container } = render(
        <div>
          <BackgroundPattern variant={variant} className='opacity-50' />
        </div>
      );
      const layer = container.querySelector('[aria-hidden="true"]');
      expect(layer).toHaveClass(
        'absolute',
        'inset-0',
        `bg-(image:${light})`,
        `dark:bg-(image:${dark})`,
        size,
        'opacity-50'
      );
      expect(BACKGROUND_PATTERNS[variant]).not.toMatch(/rgba?\(/);
      await expectNoA11yViolations(container);
    }
  );

  it('defaults to the grid and draws the gradient from surface tokens', async () => {
    const { container, rerender } = render(<BackgroundPattern />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveClass('bg-(image:--background-pattern-grid)');
    expect(layer).toHaveAttribute('aria-hidden', 'true');

    rerender(<BackgroundPattern variant='gradient' />);
    expect(layer).toHaveClass(
      'from-surface-0',
      'via-surface-1',
      'dark:to-base'
    );
    expect(layer.textContent).toBe('');
    await expectNoA11yViolations(container);
  });
});
