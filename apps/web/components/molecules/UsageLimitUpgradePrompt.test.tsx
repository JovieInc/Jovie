import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UsageLimitUpgradePrompt } from './UsageLimitUpgradePrompt';

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

describe('UsageLimitUpgradePrompt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns with the warning token near the limit and tracks the upgrade click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UsageLimitUpgradePrompt
        current={12}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-warning/30');
    expect(screen.getByText('12 of 15 weekly messages used')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Upgrade to/ }));

    expect(checkout.track).toHaveBeenCalledWith(
      'usage_limit_upgrade_clicked',
      expect.objectContaining({ feature: 'weekly messages' })
    );
    await expectNoA11yViolations(container);
  });

  it('switches to the destructive treatment at the limit', async () => {
    const { container } = render(
      <UsageLimitUpgradePrompt
        current={15}
        limit={15}
        featureName='contacts'
        upgradeCopy='unlimited contacts'
      />
    );
    expect(screen.getByRole('alert')).toHaveClass('border-destructive/30');
    expect(screen.getByText('contacts limit reached')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays hidden below the warning boundary', () => {
    const { container } = render(
      <UsageLimitUpgradePrompt
        current={3}
        limit={15}
        featureName='contacts'
        upgradeCopy='unlimited contacts'
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders right to left without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <UsageLimitUpgradePrompt
          current={12}
          limit={15}
          featureName='رسائل أسبوعية'
          upgradeCopy='70 رسالة في الأسبوع'
        />
      </div>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
