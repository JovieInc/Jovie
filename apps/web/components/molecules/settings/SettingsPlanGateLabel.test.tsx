import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

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

function renderLabel(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('SettingsPlanGateLabel', () => {
  it('defaults the gated plan label to the canonical Artist Presence name', () => {
    renderLabel(<SettingsPlanGateLabel />);

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_presence', source: 'in_app', returnTo: '/app' },
      expect.any(Object)
    );
    expect(checkout.push).not.toHaveBeenCalled();
  });

  it('respects an explicit plan name override', () => {
    renderLabel(<SettingsPlanGateLabel planName='Artist Presence Max' />);

    expect(
      screen.getByRole('link', { name: 'Upgrade to Artist Presence Max' })
    ).toBeInTheDocument();
  });
  it('starts checkout from keyboard with settings context and keeps the nudge signal', async () => {
    const user = userEvent.setup();
    globalThis.history.replaceState(
      {},
      '',
      `${APP_ROUTES.SETTINGS}?tab=analytics`
    );
    try {
      renderLabel(
        <SettingsPlanGateLabel featureContext='Advanced analytics' />
      );
      await user.tab();
      expect(
        screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
      ).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(checkout.mutate).toHaveBeenCalledWith(
        {
          priceId: 'price_presence',
          source: 'in_app',
          returnTo: `${APP_ROUTES.SETTINGS}?tab=analytics`,
        },
        expect.any(Object)
      );
      expect(checkout.track).toHaveBeenCalledWith('upgrade_nudge_clicked', {
        feature: 'Advanced analytics',
        plan_required: 'Artist Presence',
      });
    } finally {
      globalThis.history.replaceState({}, '', '/');
    }
  });
});
