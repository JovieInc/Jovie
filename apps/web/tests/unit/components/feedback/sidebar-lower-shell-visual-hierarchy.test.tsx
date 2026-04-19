import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarInstallBanner } from '@/features/feedback/SidebarInstallBanner';
import { SidebarUpgradeBanner } from '@/features/feedback/SidebarUpgradeBanner';

const mockUsePathname = vi.fn(() => '/app/chat');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/lib/env-client', () => ({
  env: {
    IS_TEST: false,
    IS_E2E: false,
  },
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => true,
}));

vi.mock('@/lib/billing/verified-upgrade', () => ({
  getPreferredVerifiedPrice: () => ({
    priceId: 'price_123',
    interval: 'month',
  }),
  formatVerifiedPriceLabel: () => '$20/mo',
}));

const mockUseBillingStatusQuery = vi.fn(() => ({
  isLoading: false,
  data: { isPro: false },
}));

const mockUsePlanGate = vi.fn(() => ({
  isPro: true,
  isTrialing: false,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: (...args: unknown[]) =>
    mockUseBillingStatusQuery(...args),
  usePricingOptionsQuery: () => ({ data: { options: [] } }),
  useCheckoutMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('@/lib/queries/usePlanGate', () => ({
  usePlanGate: () => mockUsePlanGate(),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    canPrompt: true,
    isIOS: false,
    install: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  useVersionMonitor: vi.fn(),
}));

describe('Sidebar lower shell visual hierarchy', () => {
  it('keeps upgrade banner visually quieter than nav rows', () => {
    const { container } = render(<SidebarUpgradeBanner />);

    const card = container.querySelector('[class*="rounded-xl"]');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('bg-sidebar-accent/12');

    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
  });

  it('suppresses the upgrade banner on nested demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');

    const { container } = render(<SidebarUpgradeBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps install banner visually quieter than nav rows', () => {
    const { container } = render(<SidebarInstallBanner />);

    const card = container.querySelector('[class*="rounded-xl"]');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('bg-sidebar-accent/12');

    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });
});
