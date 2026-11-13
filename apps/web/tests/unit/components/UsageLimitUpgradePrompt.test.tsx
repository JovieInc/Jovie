import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageLimitUpgradePrompt } from '@/components/molecules/UsageLimitUpgradePrompt';

const checkout = await vi.hoisted(async () => {
  const { createUpgradeCheckoutFixture } = await import(
    '@/tests/fixtures/upgrade-checkout'
  );
  return createUpgradeCheckoutFixture();
});
vi.mock('@/lib/analytics', () => ({
  track: checkout.track,
  useFeatureFlag: () => true,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: checkout.push }),
}));
vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: checkout.mutate,
    reset: checkout.reset,
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => checkout.pricing,
}));
beforeEach(() => vi.clearAllMocks());

describe('UsageLimitUpgradePrompt', () => {
  beforeEach(() => {
    checkout.track.mockClear();
  });

  it('stays hidden below the warning boundary', () => {
    const { container } = render(
      <UsageLimitUpgradePrompt
        current={11}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(checkout.track).not.toHaveBeenCalled();
  });

  it('shows an upgrade at the warning boundary', () => {
    render(
      <UsageLimitUpgradePrompt
        current={12}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '12 of 15 weekly messages used'
    );
    expect(
      screen.getByRole('button', { name: /upgrade to artist presence/i })
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_presence', source: 'in_app', returnTo: '/app' },
      expect.any(Object)
    );
    expect(checkout.push).not.toHaveBeenCalled();
    expect(checkout.track).toHaveBeenCalledWith('usage_limit_upgrade_shown', {
      feature: 'weekly messages',
      current: 12,
      limit: 15,
      percentage: 80,
    });
  });

  it('uses exhausted copy at the limit', () => {
    render(
      <UsageLimitUpgradePrompt
        current={15}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'weekly messages limit reached'
    );
  });
});
