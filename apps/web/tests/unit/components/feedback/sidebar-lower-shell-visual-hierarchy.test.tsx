import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarInstallBanner } from '@/components/feedback/SidebarInstallBanner';
import { SidebarUpgradeBanner } from '@/components/feedback/SidebarUpgradeBanner';

vi.mock('@/lib/env-client', () => ({
  env: {
    IS_TEST: false,
    IS_E2E: false,
  },
}));

vi.mock('@/lib/billing/verified-upgrade', () => ({
  getPreferredVerifiedPrice: () => ({
    priceId: 'price_123',
    interval: 'month',
  }),
  formatVerifiedPriceLabel: () => '$5/mo',
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({ isLoading: false, data: { isPro: false } }),
  usePricingOptionsQuery: () => ({ data: { options: [] } }),
  useCheckoutMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    canPrompt: true,
    isIOS: false,
    install: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/lib/feature-flags/shared', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/feature-flags/shared')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      PWA_INSTALL_BANNER: true,
    },
  };
});

vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  useVersionMonitor: vi.fn(),
}));

describe('Sidebar lower shell visual hierarchy', () => {
  it('keeps upgrade banner visually quieter than nav rows', () => {
    const { container } = render(<SidebarUpgradeBanner />);

    const card = container.querySelector('[class*="rounded-[10px]"]');
    expect(card?.className).toContain('border-sidebar-border/20');
    expect(card?.className).toContain('bg-sidebar-accent/5');

    expect(screen.getByRole('button', { name: 'Upgrade' }).className).toContain(
      'text-sidebar-item-foreground/70'
    );
  });

  it('keeps install banner visually quieter than nav rows', () => {
    const { container } = render(<SidebarInstallBanner />);

    const card = container.querySelector('[class*="rounded-[10px]"]');
    expect(card?.className).toContain('border-sidebar-border/20');
    expect(card?.className).toContain('bg-sidebar-accent/5');

    expect(screen.getByRole('button', { name: 'Install' }).className).toContain(
      'border-sidebar-border/25'
    );
  });
});
