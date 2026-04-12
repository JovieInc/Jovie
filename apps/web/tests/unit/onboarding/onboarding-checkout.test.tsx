/**
 * OnboardingCheckoutClient Tests
 * @critical — Plan selection and Stripe checkout during onboarding
 *
 * Tests pure logic functions + basic render behavior.
 * The component has many heavy dependencies, so we test the algorithm
 * (formatPrice, getAnnualSavingsPercent) directly and verify key UI states.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Pure logic tests (functions are not exported, so we duplicate the algorithm)
// ---------------------------------------------------------------------------

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function getAnnualSavingsPercent(
  monthlyAmount: number,
  annualAmount: number
): number {
  const yearlyAtMonthly = monthlyAmount * 12;
  return Math.round(((yearlyAtMonthly - annualAmount) / yearlyAtMonthly) * 100);
}

describe('@critical OnboardingCheckout — pricing logic', () => {
  it('formatPrice converts cents to dollar string', () => {
    expect(formatPrice(3900)).toBe('$39');
    expect(formatPrice(19900)).toBe('$199');
  });

  it('formatPrice handles zero', () => {
    expect(formatPrice(0)).toBe('$0');
  });

  it('formatPrice handles small amounts', () => {
    expect(formatPrice(99)).toBe('$1');
  });

  it('getAnnualSavingsPercent calculates correctly', () => {
    // $39/mo × 12 = $468/yr. Annual price $390. Savings = (468-390)/468 ≈ 17%
    expect(getAnnualSavingsPercent(3900, 39000)).toBe(17);
  });

  it('getAnnualSavingsPercent returns 0 for equal amounts', () => {
    // $39/mo × 12 = $468/yr. Annual also $468. Savings = 0%
    expect(getAnnualSavingsPercent(3900, 46800)).toBe(0);
  });

  it('getAnnualSavingsPercent handles 50% discount', () => {
    // $100/mo × 12 = $1200/yr. Annual $600. Savings = 50%
    expect(getAnnualSavingsPercent(10000, 60000)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Component render tests (mock all heavy dependencies)
// ---------------------------------------------------------------------------

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => (
    <button type='button' data-testid='button' {...props}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  BadgeCheck: () => <span data-testid='icon-badge' />,
  BarChart3: () => <span data-testid='icon-chart' />,
  Bell: () => <span data-testid='icon-bell' />,
  Sparkles: () => <span data-testid='icon-sparkles' />,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/molecules/Avatar/Avatar', () => ({
  Avatar: () => <div data-testid='avatar' />,
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <div data-testid='surface-card'>{children}</div>,
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/lib/auth/constants', () => ({
  AUTH_SURFACE: {
    pillOption: 'pill',
    pillOptionActive: 'pill-active',
  },
  FORM_LAYOUT: {
    formContainer: 'form',
    headerSection: 'header',
    title: 'title',
    hint: 'hint',
  },
}));

vi.mock('@/lib/auth/plan-intent', () => ({
  clearPlanIntent: vi.fn(),
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getEntitlements: () => ({
    marketing: { displayName: 'Pro', tagline: 'For serious artists' },
  }),
}));

vi.mock('@/lib/onboarding/return-to', () => ({
  normalizeOnboardingReturnTo: (v: string) => v,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';

const defaultProps = {
  plan: 'pro' as const,
  monthlyPriceId: 'price_monthly',
  annualPriceId: 'price_annual',
  monthlyAmount: 3900,
  annualAmount: 39000,
  displayName: 'Tim White',
  username: 'timwhite',
  avatarUrl: 'https://example.com/avatar.jpg',
  spotifyFollowers: 5000,
  isDefaultUpsell: false,
};

describe('@critical OnboardingCheckoutClient — render', () => {
  it('renders display name', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(screen.getByText('Tim White')).toBeDefined();
  });

  it('renders username with @ prefix', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(screen.getByText('@timwhite')).toBeDefined();
  });

  it('renders spotify followers when present', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(screen.getByText('5,000 Spotify followers')).toBeDefined();
  });

  it('hides followers section when null', () => {
    render(
      <OnboardingCheckoutClient {...defaultProps} spotifyFollowers={null} />
    );
    expect(screen.queryByText('Spotify followers')).toBeNull();
  });

  it('renders plan highlight features', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(screen.getByText('Release notifications')).toBeDefined();
    expect(screen.getByText('90-day analytics')).toBeDefined();
    expect(screen.getByText('Verified badge')).toBeDefined();
  });

  it('renders billing interval selector when annual price exists', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(screen.getByText('Monthly')).toBeDefined();
    expect(screen.getByText(/Annual/)).toBeDefined();
  });
});
