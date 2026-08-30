import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JovieIcon } from './JovieIcon';

describe('JovieIcon', () => {
  it('renders a decorative music-mark at the requested size', () => {
    const { container } = render(
      <JovieIcon size={32} className='text-accent' />
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('text-accent');
    expect(icon?.querySelectorAll('circle')).toHaveLength(2);
  });
});
