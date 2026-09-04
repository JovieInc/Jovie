import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MarketingSectionHeading } from './MarketingSectionHeading';

it('renders the canonical section heading with its accessible id', () => {
  render(
    <MarketingSectionHeading id='audience' className='mt-5'>
      Know your audience
    </MarketingSectionHeading>
  );

  expect(
    screen.getByRole('heading', { level: 2, name: 'Know your audience' })
  ).toHaveAttribute('id', 'audience');
  expect(screen.getByRole('heading')).toHaveClass(
    'system-b-marketing-section-heading',
    'text-primary-token',
    'mt-5'
  );
});
