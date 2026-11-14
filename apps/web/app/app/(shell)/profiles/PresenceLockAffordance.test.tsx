import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PresenceLockAffordance } from './PresenceLockAffordance';

const { checkout } = vi.hoisted(() => ({ checkout: vi.fn() }));
vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: checkout,
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => ({
    data: {
      options: [
        {
          priceId: 'price_presence',
          amount: 1200,
          currency: 'usd',
          interval: 'month',
          description: 'Artist Presence',
        },
      ],
    },
    isPending: false,
    error: null,
  }),
}));
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: () => true,
}));
it('starts the shared checkout from the lock popover without activating its row', () => {
  const rowClick = vi.fn();
  render(<PresenceLockAffordance />);
  document.addEventListener('click', rowClick);
  fireEvent.click(
    screen.getByRole('button', { name: 'Monitoring Restricted' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
  expect(checkout).toHaveBeenCalledWith(
    expect.objectContaining({ priceId: 'price_presence', source: 'in_app' }),
    expect.any(Object)
  );
  document.removeEventListener('click', rowClick);
  expect(rowClick).not.toHaveBeenCalled();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
