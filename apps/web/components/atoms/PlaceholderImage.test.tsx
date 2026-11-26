import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PlaceholderImage } from './PlaceholderImage';

describe('PlaceholderImage', () => {
  it('renders the default decorative glyph with size and shape classes', async () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <PlaceholderImage ref={ref} size='lg' shape='rounded' />
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.className).toContain('h-16');
    expect(ref.current?.className).toContain('rounded-lg');
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('uses the semantic surface tokens', () => {
    const { container } = render(<PlaceholderImage />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).toContain('from-surface-2');
    expect(tile.className).not.toMatch(/gray-/);
  });

  it('renders children in place of the glyph', async () => {
    const { container } = render(
      <PlaceholderImage className='custom'>
        <span>AB</span>
      </PlaceholderImage>
    );
    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.firstElementChild).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });
});
