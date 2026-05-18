import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarUpgradeBanner } from '@/features/feedback/SidebarUpgradeBanner';

const mockUsePathname = vi.fn(() => '/app/chat');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
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
  isLoading: false,
  isPro: false,
  isTrialing: false,
  trialDaysRemaining: null,
  trialNotificationsSent: 0,
  nudgeState: 'never_trialed' as const,
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

vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  useVersionMonitor: vi.fn(),
}));

describe('Sidebar lower shell visual hierarchy', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUsePathname.mockReturnValue('/app/chat');
  });

  it('uses the shell install banner treatment for upgrade nudges', () => {
    const { container } = render(<SidebarUpgradeBanner />);

    const card = container.querySelector('[class*="rounded-xl"]');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('bg-(--surface-1)/60');

    expect(
      screen.getByRole('button', { name: 'Start trial' })
    ).toBeInTheDocument();
  });

  it('lets users dismiss the current upgrade nudge for the session', () => {
    render(<SidebarUpgradeBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss prompt' }));

    expect(
      screen.queryByRole('button', { name: 'Start trial' })
    ).not.toBeInTheDocument();
  });

  it('suppresses the upgrade banner on nested demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');

    const { container } = render(<SidebarUpgradeBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
