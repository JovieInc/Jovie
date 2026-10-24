import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingRoundedFrame } from './MarketingRoundedFrame';

describe('MarketingRoundedFrame', () => {
  it('keeps media and captions inside the shared rounded frame with caller classes', () => {
    render(
      <MarketingRoundedFrame className='w-full'>
        <figure aria-label='Profile preview'>
          <figcaption>A direct connection</figcaption>
        </figure>
      </MarketingRoundedFrame>
    );

    expect(
      screen.getByRole('figure', { name: 'Profile preview' }).parentElement
    ).toHaveClass('marketing-rounded-frame', 'w-full');
    expect(screen.getByText('A direct connection')).toBeVisible();
  });
});
