import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';

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
  it('keeps a busy switch focused while blocking another change', () => {
    const change = vi.fn();
    render(
      <SettingsToggleRow
        title='Discovery'
        checked={false}
        onCheckedChange={change}
        busy
        ariaLabel='Discovery'
      />
    );
    const control = screen.getByRole('switch');
    control.focus();
    fireEvent.click(control);
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAttribute('aria-busy', 'true');
    expect(change).not.toHaveBeenCalled();
  });
  it('retains compact title typography alongside semantic color classes', () => {
    render(
      <SettingsToggleRow
        title='High Contrast'
        description='Increase contrast for text, borders, and surfaces.'
        checked={false}
        onCheckedChange={vi.fn()}
        ariaLabel='Toggle high contrast mode'
      />
    );

    expect(screen.getByRole('heading', { name: 'High Contrast' })).toHaveClass(
      'text-app',
      'text-primary-token'
    );
  });

  it('dims disabled interactive rows while keeping the switch labeled by the row title', () => {
    render(
      <SettingsToggleRow
        icon={<span data-testid='row-icon'>C</span>}
        title='High Contrast'
        description='Increase contrast for text, borders, and surfaces.'
        checked={false}
        onCheckedChange={vi.fn()}
        disabled
        ariaLabel='Toggle high contrast mode'
      />
    );

    const heading = screen.getByRole('heading', { name: 'High Contrast' });
    const row = heading.closest('[data-state="disabled"]');

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(heading).toHaveClass('text-(--color-text-disabled-token)');
    expect(
      screen.getByText('Increase contrast for text, borders, and surfaces.')
    ).toHaveClass('text-quaternary-token');
    expect(screen.getByTestId('row-icon').parentElement).toHaveClass(
      'text-(--color-text-disabled-token)'
    );
    expect(
      screen.getByRole('switch', { name: 'High Contrast' })
    ).toBeDisabled();
  });

  it('names the canonical Artist Presence plan on a gated row', () => {
    render(
      <TooltipProvider>
        <SettingsToggleRow
          title='Release Radar'
          description='Track release performance.'
          gated
        />
      </TooltipProvider>
    );

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
  it('keeps the Max-only notification setting on plan comparison, not Presence checkout', () => {
    render(
      <TooltipProvider>
        <SettingsToggleRow title='Double Opt-In' gated gatePlanName='Max' />
      </TooltipProvider>
    );
    expect(
      screen.getByRole('link', { name: 'Upgrade to Max' })
    ).toHaveAttribute('href', '/pricing');
    expect(checkout.mutate).not.toHaveBeenCalled();
  });
});
