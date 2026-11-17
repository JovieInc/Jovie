import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsToggleRow } from './SettingsToggleRow';

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

describe('SettingsToggleRow', () => {
  it('flips the switch through onCheckedChange, axe-clean', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { container } = render(
      <SettingsToggleRow
        id='contrast'
        title='High Contrast'
        description='Increase contrast for text, borders, and surfaces.'
        checked={false}
        onCheckedChange={onCheckedChange}
        ariaLabel='Toggle high contrast mode'
      />
    );
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('aria-labelledby', 'contrast-title');
    expect(control).toHaveAttribute('aria-describedby', 'contrast-description');
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);
  });

  it('turns a checked row off from the keyboard', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <SettingsToggleRow
        title='High Contrast'
        checked
        onCheckedChange={onCheckedChange}
        ariaLabel='Toggle high contrast mode'
      />
    );
    screen.getByRole('switch').focus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('marks a disabled row and ignores clicks', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { container } = render(
      <SettingsToggleRow
        title='High Contrast'
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
        ariaLabel='Toggle high contrast mode'
      />
    );
    expect(container.firstElementChild).toHaveAttribute(
      'data-state',
      'disabled'
    );
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('swaps the switch for the plan gate when gated', async () => {
    const { container } = render(
      <TooltipProvider>
        <SettingsToggleRow
          gated
          title='Double Opt-in Verification'
          description='Verify fan email addresses before notifications begin.'
          gatePlanName='Growth'
          gateFeatureContext='Double opt-in confirmation'
        />
      </TooltipProvider>
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-state', 'gated');
    expect(
      screen.getByRole('link', { name: 'Upgrade to Growth' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const title =
      'Increase contrast for text, borders and surfaces in every theme';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SettingsToggleRow
          title={title}
          checked
          onCheckedChange={vi.fn()}
          ariaLabel='Toggle high contrast mode'
        />
        <SettingsToggleRow
          title='تباين عالٍ'
          description='زيادة التباين للنصوص والحدود والأسطح.'
          checked={false}
          onCheckedChange={vi.fn()}
          ariaLabel='تبديل وضع التباين العالي'
        />
      </div>
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
