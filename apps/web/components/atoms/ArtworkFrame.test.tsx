import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
  getArtworkFitClassName,
  getArtworkRadiusClassName,
  getArtworkRadiusPx,
  isApprovedArtworkRadiusClassName,
} from './ArtworkFrame';

// A 1x1 transparent GIF keeps the fixture offline.
const ARTWORK_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('ArtworkFrame', () => {
  it.each([
    [24, 'thumbnail', 'rounded-xs'],
    [48, 'thumbnail', 'rounded-xs'],
    [49, 'default', 'rounded-lg'],
    [159, 'default', 'rounded-lg'],
    [160, 'hero', 'rounded-xl'],
    ['thumbnail', 'thumbnail', 'rounded-xs'],
    ['default', 'default', 'rounded-lg'],
    ['hero', 'hero', 'rounded-xl'],
  ] as const)('scales the radius for size %s', (size, scale, radius) => {
    render(<ArtworkFrame size={size} data-testid='frame' />);

    const frame = screen.getByTestId('frame');
    expect(frame).toHaveAttribute('data-artwork-frame', scale);
    expect(frame).toHaveClass(radius, 'overflow-hidden', 'shrink-0');
  });

  it('keeps the owned radius when a caller passes a competing radius class', () => {
    render(
      <ArtworkFrame
        size='hero'
        className='h-40 w-40 rounded-full'
        data-testid='frame'
      />
    );

    const frame = screen.getByTestId('frame');
    expect(frame).toHaveClass('h-40', 'w-40', 'rounded-xl');
    expect(frame).not.toHaveClass('rounded-full');
  });

  it('forwards DOM attributes and renders its media child', async () => {
    const { container } = render(
      <ArtworkFrame size={145} role='group' aria-label='Release artwork'>
        <img
          alt='Never Say A Word artwork'
          className={`h-full w-full ${ARTWORK_FIT_CLASSNAME}`}
          src={ARTWORK_SRC}
        />
      </ArtworkFrame>
    );

    expect(
      screen.getByRole('group', { name: 'Release artwork' })
    ).toContainElement(
      screen.getByRole('img', { name: 'Never Say A Word artwork' })
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations beside a right-to-left title', async () => {
    const { container } = render(
      <div dir='rtl' className='flex items-center gap-3'>
        <ArtworkFrame size='thumbnail' className='h-10 w-10'>
          <img
            alt=''
            className='h-full w-full object-contain'
            src={ARTWORK_SRC}
          />
        </ArtworkFrame>
        <span>لا تقل كلمة</span>
      </div>
    );

    await expectNoA11yViolations(container);
  });

  it('exposes the radius, fit and approval helpers the frame uses', () => {
    expect(getArtworkRadiusClassName(32)).toBe('rounded-xs');
    expect(getArtworkRadiusClassName(96)).toBe('rounded-lg');
    expect(getArtworkRadiusClassName(320)).toBe('rounded-xl');
    expect(getArtworkRadiusPx('thumbnail')).toBe(2);
    expect(getArtworkRadiusPx(96)).toBe(8);
    expect(getArtworkRadiusPx(200)).toBe(12);
    expect(getArtworkFitClassName()).toBe('object-contain');
    expect(getArtworkFitClassName('release')).toBe('object-contain');
    expect(getArtworkFitClassName('merch')).toBe('object-cover');
    expect(isApprovedArtworkRadiusClassName('rounded-lg')).toBe(true);
    expect(isApprovedArtworkRadiusClassName('rounded-full')).toBe(false);
  });
});
