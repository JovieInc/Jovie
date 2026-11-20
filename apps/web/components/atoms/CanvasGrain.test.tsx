import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CanvasGrain } from './CanvasGrain';

describe('CanvasGrain', () => {
  it('paints a hidden, click-through noise layer over its frame', async () => {
    const { container } = render(
      <main className='relative'>
        <p>Release plan</p>
        <CanvasGrain className='rounded-lg' />
      </main>
    );

    const grain = container.querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement;
    expect(grain).not.toBeNull();
    expect(grain).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0',
      'rounded-lg'
    );
    expect(grain.style.mixBlendMode).toBe('overlay');
    expect(grain.style.opacity).toBe('0.06');
    expect(grain.style.backgroundImage).toContain('data:image/svg+xml');
    expect(grain).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
