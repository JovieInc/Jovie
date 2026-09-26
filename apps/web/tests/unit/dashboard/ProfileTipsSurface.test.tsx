import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePaySurface } from '@/features/dashboard/molecules/ProfilePaySurface';
import { resolveProfileMonetizationSummary } from '@/lib/profile-monetization';
import { fastRender } from '@/tests/utils/fast-render';

const { mockUseAppFlag, mockCopyToClipboard } = vi.hoisted(() => ({
  mockUseAppFlag: vi.fn(),
  mockCopyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt='' />,
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: (flagName: string) => mockUseAppFlag(flagName),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));

vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeDataUrl: vi
    .fn()
    .mockResolvedValue('data:image/png;base64,qr-preview'),
  generateQrCodeSvg: vi.fn().mockResolvedValue('<svg></svg>'),
}));

vi.mock('@/lib/utils/download', () => ({
  downloadBlob: vi.fn(),
  downloadString: vi.fn(),
}));

const baseCallbacks = {
  onSetUsername: vi.fn(),
  onSetUpTips: vi.fn(),
  onManagePayments: vi.fn(),
  onViewAnalytics: vi.fn(),
};

const renderCases = [
  {
    name: 'needs_profile_url',
    summary: resolveProfileMonetizationSummary({
      username: null,
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    }),
    heading: 'Finish Your Profile URL',
    action: 'Set Username',
  },
  {
    name: 'not_setup',
    summary: resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    }),
    heading: 'Payments Off',
    action: 'Set Up Payments',
  },
  {
    name: 'setup_incomplete',
    summary: resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    }),
    heading: 'Finish Payments Setup',
    action: 'Complete Setup',
  },
  {
    name: 'ready_no_activity',
    summary: resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    }),
    heading: 'Payments Live',
    action: 'Copy Pay Link',
  },
  {
    name: 'traffic_no_tips',
    summary: resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: true,
      tipVisits: 42,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    }),
    heading: 'Payments Live',
    action: 'Copy Pay Link',
  },
  {
    name: 'active',
    summary: resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 10,
      tipsReceived: 3,
      totalReceivedCents: 23500,
      monthReceivedCents: 12000,
    }),
    heading: 'Payments Live',
    action: 'Copy Pay Link',
  },
] as const;

describe('ProfilePaySurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppFlag.mockReturnValue(false);
  });

  describe.each(['settings', 'drawer'] as const)('%s variant', variant => {
    it.each(renderCases)('renders $name state', ({
      summary,
      heading,
      action,
    }) => {
      const { getByText, getByRole, getByTestId } = fastRender(
        <ProfilePaySurface
          summary={summary}
          variant={variant}
          {...baseCallbacks}
        />
      );

      expect(getByTestId(`profile-tips-surface-${variant}`)).toBeDefined();
      expect(getByText(heading)).toBeDefined();
      expect(getByRole('button', { name: action })).toBeDefined();
    });
  });

  it('uses Set Up Payments copy when Stripe Connect is enabled', () => {
    mockUseAppFlag.mockReturnValue(true);

    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    const { getByRole } = fastRender(
      <ProfilePaySurface summary={summary} {...baseCallbacks} />
    );

    expect(getByRole('button', { name: 'Set Up Payments' })).toBeDefined();
  });

  it('shows analytics CTA when payment traffic exists', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 6,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    const { getByRole } = fastRender(
      <ProfilePaySurface summary={summary} {...baseCallbacks} />
    );

    expect(
      getByRole('button', { name: 'View payment traffic in Analytics' })
    ).toBeDefined();
  });

  it('hides analytics CTA when no payment traffic exists', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    const { queryByRole } = fastRender(
      <ProfilePaySurface summary={summary} {...baseCallbacks} />
    );

    expect(
      queryByRole('button', { name: 'View payment traffic in Analytics' })
    ).toBeNull();
  });

  it('keeps the polite status live region mounted even before a message is shown', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    const { container } = fastRender(
      <ProfilePaySurface summary={summary} {...baseCallbacks} />
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');

    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveClass('sr-only');
    expect(liveRegion).toHaveTextContent('');
  });
});
