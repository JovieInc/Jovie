import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';

describe('MarketingSurfaceCard', () => {
  it('rounds framed content and keeps its labels and children available', () => {
    render(
      <MarketingSurfaceCard
        testId='card'
        variant='product-callout'
        label='Profile'
        stateLabel='Ready'
      >
        <p>Share one link</p>
      </MarketingSurfaceCard>
    );

    expect(screen.getByTestId('card')).toHaveClass(
      'marketing-rounded-frame',
      'border',
      'ds-glass'
    );
    expect(
      screen.getByTestId('card').querySelector('[aria-hidden="true"]')
    ).toBeNull();
    expect(screen.getByText('Profile')).toBeVisible();
    expect(screen.getByText('Ready')).toBeVisible();
    expect(screen.getByText('Share one link')).toBeVisible();
  });

  it('keeps full-bleed images inside the same rounded card without framed chrome', () => {
    render(
      <MarketingSurfaceCard
        testId='card'
        src='/preview.png'
        alt='Profile preview'
        className='w-full'
      />
    );

    expect(screen.getByTestId('card')).toHaveClass(
      'marketing-rounded-frame',
      'w-full'
    );
    expect(screen.getByTestId('card')).not.toHaveClass('border', 'ds-glass');
    expect(
      screen.getByRole('img', { name: 'Profile preview' }).parentElement
    ).toBe(screen.getByTestId('card'));
  });
});
