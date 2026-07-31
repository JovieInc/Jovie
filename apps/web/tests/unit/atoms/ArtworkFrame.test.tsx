import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ArtworkFrame,
  getArtworkRadiusClassName,
} from '@/components/atoms/ArtworkFrame';

describe('ArtworkFrame', () => {
  it.each([
    [28, 'rounded-xs'],
    [48, 'rounded-xs'],
    [49, 'rounded-lg'],
    [96, 'rounded-lg'],
    [160, 'rounded-xl'],
    ['thumbnail', 'rounded-xs'],
    ['default', 'rounded-lg'],
    ['hero', 'rounded-xl'],
  ] as const)('maps %s artwork to %s', (size, expectedClassName) => {
    expect(getArtworkRadiusClassName(size)).toBe(expectedClassName);
  });

  it('removes decorative framing while preserving caller geometry', () => {
    const { container } = render(
      <ArtworkFrame size='thumbnail' className='h-10 w-10'>
        Artwork
      </ArtworkFrame>
    );
    const frame = container.firstElementChild as HTMLElement;

    expect(frame).toHaveAttribute('data-artwork-frame', 'thumbnail');
    expect(frame).toHaveClass(
      'h-10',
      'w-10',
      'rounded-xs',
      'border-0',
      'outline-none',
      'shadow-none'
    );
  });
});
