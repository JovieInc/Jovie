import { Button } from '@jovie/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UpgradeButton } from './UpgradeButton';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  track: vi.fn(),
  directUpgrade: { current: false },
  pricing: {
    current: {
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
      error: null as unknown,
    },
  },
  mutation: {
    current: {
      mutate: vi.fn(),
      reset: vi.fn(),
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
  usePricingOptionsQuery: () => mocks.pricing.current,
}));

describe('UpgradeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directUpgrade.current = false;
    mocks.pricing.current = {
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
    };
    mocks.mutation.current = {
      mutate: vi.fn(),
      reset: vi.fn(),
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

  it('resolves the canonical monthly price without making callers supply one', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.mutation.current.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_presence', source: 'in_app' }),
      expect.any(Object)
    );
  });

  it('starts direct checkout for the price when direct upgrade is on', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton priceId='price_123' />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.mutation.current.mutate).toHaveBeenCalledWith(
      { priceId: 'price_123', source: 'in_app', returnTo: '/app' },
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
    act(() => callbacks.onError(new Error('Card declined')));

    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', {
      flow_type: 'direct',
      price_id: 'price_123',
      error: 'Card declined',
    });
  });

  it('disables itself and shows progress while checkout is pending', async () => {
    mocks.mutation.current = {
      mutate: vi.fn(),
      reset: vi.fn(),
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
      reset: vi.fn(),
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
      reset: vi.fn(),
      isPending: false,
      error: 'boom',
    };
    render(<UpgradeButton />);

    expect(screen.getByText('Failed to start checkout')).toBeInTheDocument();
  });
  it('waits for pricing and fails closed when the canonical price is unavailable', () => {
    mocks.directUpgrade.current = true;
    mocks.pricing.current = {
      data: { options: [] },
      isPending: true,
      error: null,
    };
    const { rerender } = render(<UpgradeButton />);
    expect(screen.getByRole('button')).toBeDisabled();
    mocks.pricing.current = {
      data: { options: [] },
      isPending: false,
      error: new Error('Offline'),
    };
    rerender(<UpgradeButton />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checkout is unavailable'
    );
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.mutation.current.mutate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('allows a retry after failure but never starts two concurrent checkouts', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.mutation.current.mutate).toHaveBeenCalledTimes(1);
    act(() =>
      mocks.mutation.current.mutate.mock.calls[0][1].onError(
        new Error('Offline')
      )
    );
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.mutation.current.mutate).toHaveBeenCalledTimes(2);
  });
  it('releases checkout ownership when the browser restores a page after leaving Stripe', () => {
    mocks.directUpgrade.current = true;
    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole('button'));
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    act(() => globalThis.dispatchEvent(restored));
    expect(mocks.mutation.current.reset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.mutation.current.mutate).toHaveBeenCalledTimes(2);
  });
  it('composes a named button, preserves its click signal, and locks only during checkout', () => {
    mocks.directUpgrade.current = true;
    const onClick = vi.fn();
    const control = (
      <UpgradeButton asChild>
        <Button type='button' disabled={false} onClick={onClick}>
          Artist Presence
        </Button>
      </UpgradeButton>
    );
    const { rerender } = render(control);
    const button = screen.getByRole('button', { name: 'Artist Presence' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.current.mutate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    act(() =>
      mocks.mutation.current.mutate.mock.calls[0][1].onError(
        new Error('Offline')
      )
    );
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
    mocks.pricing.current.data.options = [];
    rerender(control);
    // Force a props render after replacing the query result.
    rerender(
      <UpgradeButton asChild>
        <Button type='button'>Artist Presence</Button>
      </UpgradeButton>
    );
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checkout is unavailable'
    );
  });
});
