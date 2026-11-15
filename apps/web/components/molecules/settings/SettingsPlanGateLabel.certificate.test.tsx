import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('SettingsPlanGateLabel certificate', () => {
  it('records the nudge once for a gated feature and stays axe-clean', async () => {
    const { container } = renderLabel(
      <SettingsPlanGateLabel featureContext='Custom domains' />
    );
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeEnabled();
    expect(checkout.track).toHaveBeenCalledWith('upgrade_nudge_shown', {
      feature: 'Custom domains',
      plan_required: 'Artist Presence',
    });
    expect(checkout.track).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the plan-only tooltip on hover without a feature context', async () => {
    const user = userEvent.setup();
    renderLabel(<SettingsPlanGateLabel />);
    await user.hover(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );
    expect(
      (await screen.findAllByText('Available on Artist Presence')).length
    ).toBeGreaterThan(0);
    expect(checkout.track).not.toHaveBeenCalledWith(
      'upgrade_nudge_shown',
      expect.anything()
    );
  });

  it('links a custom plan to pricing and tracks the click', async () => {
    const user = userEvent.setup();
    const { container } = renderLabel(
      <SettingsPlanGateLabel
        planName='Artist Presence Max with Label Services'
        featureContext='Double opt-in confirmation'
      />
    );
    const link = screen.getByRole('link', {
      name: 'Upgrade to Artist Presence Max with Label Services',
    });
    expect(link).toHaveAttribute('href', APP_ROUTES.PRICING);
    await expectNoA11yViolations(container);
    await user.click(link);
    expect(checkout.track).toHaveBeenCalledWith('upgrade_nudge_clicked', {
      feature: 'Double opt-in confirmation',
      plan_required: 'Artist Presence Max with Label Services',
    });
  });

  it('renders axe-clean in an RTL document', async () => {
    const { container } = renderLabel(
      <div dir='rtl' lang='ar'>
        <SettingsPlanGateLabel planName='النخبة' />
      </div>
    );
    expect(
      screen.getByRole('link', { name: 'Upgrade to النخبة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
