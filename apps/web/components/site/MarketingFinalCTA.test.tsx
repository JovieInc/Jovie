import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MarketingFinalCTA } from './MarketingFinalCTA';

it('defaults the final action to claiming a handle through the shared front door', () => {
  render(<MarketingFinalCTA />);
  expect(
    screen.getByRole('link', { name: 'Claim your handle' })
  ).toHaveAttribute('href', '/start');
});
