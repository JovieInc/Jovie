import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PlayIcon } from './PlayIcon';

describe('PlayIcon', () => {
  it('owns the 1px optical offset', () => {
    const { container } = render(<PlayIcon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('h-3.5', 'w-3.5', 'translate-x-px');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    [12, ['h-3', 'w-3']],
    [14, ['h-3.5', 'w-3.5']],
    [16, ['h-4', 'w-4']],
  ] as const)('sizes %spx with %s', (size, classes) => {
    const { container } = render(<PlayIcon size={size} />);
    expect(container.querySelector('svg')).toHaveClass(...classes);
  });

  it('passes className, strokeWidth and fill through', () => {
    const { container } = render(
      <PlayIcon
        size={12}
        className='text-tooltip-foreground'
        strokeWidth={2.5}
        fill='currentColor'
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-tooltip-foreground', 'translate-x-px');
    expect(svg).toHaveAttribute('stroke-width', '2.5');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it.each([12, 14, 16] as const)(
    'has no a11y violations at %spx inside a labelled button',
    async size => {
      const { container } = render(
        <button type='button' aria-label='Play'>
          <PlayIcon size={size} />
        </button>
      );
      await expectNoA11yViolations(container);
    }
  );
});
