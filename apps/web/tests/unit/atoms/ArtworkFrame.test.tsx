import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_ARTWORK_RADIUS_CLASSNAMES,
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
  getArtworkFitClassName,
  getArtworkRadiusClassName,
  getArtworkRadiusPx,
  isApprovedArtworkRadiusClassName,
} from '@/components/atoms/ArtworkFrame';

function redFixture(testId: string, frameClass: string, imageClass: string) {
  return (
    <div data-testid={testId} data-deliberate-red='' className={frameClass}>
      <img data-testid={`${testId}-image`} alt='' className={imageClass} />
    </div>
  );
}

describe('ArtworkFrame', () => {
  it.each([
    [28, 'rounded-xs'],
    [48, 'rounded-xs'],
    [145, 'rounded-lg'],
    [160, 'rounded-xl'],
    ['thumbnail', 'rounded-xs'],
    ['default', 'rounded-lg'],
    ['hero', 'rounded-xl'],
  ] as const)('maps %s artwork to %s', (size, expectedClassName) => {
    expect(getArtworkRadiusClassName(size)).toBe(expectedClassName);
    expect(isApprovedArtworkRadiusClassName(expectedClassName)).toBe(true);
  });

  it('owns contain fit and restrained radii for release artwork', () => {
    expect(ARTWORK_FIT_CLASSNAME).toBe('object-contain');
    expect(getArtworkFitClassName('release')).toBe('object-contain');
    expect(getArtworkFitClassName('merch')).toBe('object-cover');
    expect(getArtworkFitClassName('avatar')).toBe('object-cover');
    expect(getArtworkRadiusPx(40)).toBe(2);
    expect(getArtworkRadiusPx(145)).toBe(8);
    expect(getArtworkRadiusPx(224)).toBe(12);
    expect(APPROVED_ARTWORK_RADIUS_CLASSNAMES).toEqual([
      'rounded-xs',
      'rounded-lg',
      'rounded-xl',
    ]);
    expect(isApprovedArtworkRadiusClassName('rounded-full')).toBe(false);
  });

  it('preserves caller geometry and rejects avatar-style crops', () => {
    const { container } = render(
      <ArtworkFrame size='thumbnail' className='h-10 w-10'>
        Artwork
      </ArtworkFrame>
    );
    expect(container.firstElementChild).toHaveClass(
      'h-10',
      'w-10',
      'rounded-xs',
      'border-0'
    );

    render(
      redFixture(
        'cropped-release-artwork-fixture',
        'overflow-hidden rounded-full',
        'rounded-full object-cover'
      )
    );
    render(
      redFixture(
        'pill-release-artwork-fixture',
        'overflow-hidden rounded-(--profile-action-radius)',
        'object-cover'
      )
    );
    render(
      <ArtworkFrame size={145} data-testid='production-artwork'>
        <img alt='Complete artwork' className={ARTWORK_FIT_CLASSNAME} />
      </ArtworkFrame>
    );

    expect(screen.getByTestId('cropped-release-artwork-fixture')).toHaveClass(
      'rounded-full'
    );
    expect(
      screen.getByTestId('cropped-release-artwork-fixture-image')
    ).toHaveClass('object-cover');
    expect(screen.getByTestId('pill-release-artwork-fixture')).toHaveClass(
      'rounded-(--profile-action-radius)'
    );
    const production = screen.getByTestId('production-artwork');
    expect(production).toHaveClass('rounded-lg');
    expect(production.className).not.toContain('--profile-action-radius');
    expect(screen.getByRole('img', { name: 'Complete artwork' })).toHaveClass(
      'object-contain'
    );
  });
});
