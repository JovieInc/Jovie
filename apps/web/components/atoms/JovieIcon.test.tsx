import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { JovieIcon } from './JovieIcon';

describe('JovieIcon', () => {
  it('renders a decorative music-mark at the requested size', async () => {
    const { container } = render(
      <JovieIcon size={32} className='text-accent' />
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('text-accent');
    expect(icon?.querySelectorAll('circle')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('defaults to 24px in black ink on light and white in dark', async () => {
    const { container } = render(<JovieIcon />);

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('fill', 'currentColor');
    // ink-on-media is #000000 and on-media #ffffff in both themes, the values
    // text-black and dark:text-white drew.
    expect(icon).toHaveClass('text-ink-on-media', 'dark:text-on-media');
    await expectNoA11yViolations(container);
  });

  it('keeps the dark ink when a caller recolours the light mark', () => {
    const { container } = render(<JovieIcon className='text-accent' />);

    const icon = container.querySelector('svg');
    expect(icon).not.toHaveClass('text-ink-on-media');
    expect(icon).toHaveClass('dark:text-on-media');
  });

  it('stays unmirrored and hidden from assistive tech in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <JovieIcon />
        <span>جوفي</span>
      </div>
    );

    expect(container.querySelector('svg')).not.toHaveClass('-scale-x-100');
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
