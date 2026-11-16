import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UpgradeButton } from './UpgradeButton';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  track: vi.fn(),
  directUpgrade: { current: false },
  mutation: {
    current: {
      mutate: vi.fn(),
      isPending: false,
      error: null as unknown,
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/analytics', () => ({
  track: mocks.track,
  useFeatureFlag: () => mocks.directUpgrade.current,
}));

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => mocks.mutation.current,
}));

describe('UpgradeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directUpgrade.current = false;
    mocks.mutation.current = {
      mutate: vi.fn(),
      isPending: false,
      error: null,
    };
  });

  it('defaults its label to the canonical Artist Presence plan name', async () => {
    const { container } = render(<UpgradeButton />);

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('respects explicit children over the default label', () => {
    render(<UpgradeButton>See plans</UpgradeButton>);

    expect(
      screen.getByRole('button', { name: 'See plans' })
    ).toBeInTheDocument();
  });

  it('sends the user to pricing when direct upgrade is off', () => {
    render(<UpgradeButton priceId='price_123' />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.push).toHaveBeenCalledWith('/pricing');
    expect(mocks.mutation.current.mutate).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('upgrade_button_clicked', {
      flow_type: 'pricing_page',
      price_id: 'price_123',
      feature_flag_enabled: false,
    });
  });

  it('sends the user to pricing when direct upgrade is on but no price is set', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.push).toHaveBeenCalledWith('/pricing');
    expect(mocks.mutation.current.mutate).not.toHaveBeenCalled();
  });

  it('starts direct checkout for the price when direct upgrade is on', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton priceId='price_123' />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.mutation.current.mutate).toHaveBeenCalledWith(
      { priceId: 'price_123' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(mocks.track).toHaveBeenCalledWith('checkout_initiated', {
      flow_type: 'direct',
      price_id: 'price_123',
    });
  });

  it('tracks a failed direct checkout with the error message', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton priceId='price_123' />);
    fireEvent.click(screen.getByRole('button'));

    const [, callbacks] = mocks.mutation.current.mutate.mock.calls[0];
    callbacks.onError(new Error('Card declined'));

    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', {
      flow_type: 'direct',
      price_id: 'price_123',
      error: 'Card declined',
    });
  });

  it('disables itself and shows progress while checkout is pending', async () => {
    mocks.mutation.current = {
      mutate: vi.fn(),
      isPending: true,
      error: null,
    };
    const { container } = render(<UpgradeButton />);

    const button = screen.getByRole('button', { name: 'Loading...' });
    expect(button).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows the checkout error below the button', async () => {
    mocks.mutation.current = {
      mutate: vi.fn(),
      isPending: false,
      error: new Error('Network request failed'),
    };
    const { container } = render(<UpgradeButton />);

    expect(screen.getByText('Network request failed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('falls back to generic copy for a non-Error failure', () => {
    mocks.mutation.current = {
      mutate: vi.fn(),
      isPending: false,
      error: 'boom',
    };
    render(<UpgradeButton />);

    expect(screen.getByText('Failed to start checkout')).toBeInTheDocument();
  });
});
