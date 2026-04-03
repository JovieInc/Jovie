import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileTipsSurface } from '@/features/dashboard/molecules/ProfileTipsSurface';
import { resolveProfileMonetizationSummary } from '@/lib/profile-monetization';
import { fastRender } from '@/tests/utils/fast-render';

const { mockUseCodeFlag, mockCopyToClipboard } = vi.hoisted(() => ({
  mockUseCodeFlag: vi.fn(),
  mockCopyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt='' />,
}));

vi.mock('@/lib/feature-flags/client', () => ({
  useCodeFlag: (flagName: string) => mockUseCodeFlag(flagName),
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
    heading: 'Tips Off',
    action: 'Set Up Tips',
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
    heading: 'Tips Live',
    action: 'Copy Tip Link',
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
    heading: 'Tips Live',
    action: 'Copy Tip Link',
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
    heading: 'Tips Live',
    action: 'Copy Tip Link',
  },
] as const;

describe('ProfileTipsSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCodeFlag.mockReturnValue(false);
  });

  describe.each(['settings', 'drawer'] as const)('%s variant', variant => {
    it.each(renderCases)('renders $name state', ({
      summary,
      heading,
      action,
    }) => {
      const { getByText, getByRole, getByTestId } = fastRender(
        <ProfileTipsSurface
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
    mockUseCodeFlag.mockReturnValue(true);

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
      <ProfileTipsSurface summary={summary} {...baseCallbacks} />
    );

    expect(getByRole('button', { name: 'Set Up Payments' })).toBeDefined();
  });

  it('shows analytics CTA when tip traffic exists', () => {
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
      <ProfileTipsSurface summary={summary} {...baseCallbacks} />
    );

    expect(
      getByRole('button', { name: 'View Tip Traffic In Analytics' })
    ).toBeDefined();
  });

  it('hides analytics CTA when no tip traffic exists', () => {
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
      <ProfileTipsSurface summary={summary} {...baseCallbacks} />
    );

    expect(
      queryByRole('button', { name: 'View Tip Traffic In Analytics' })
    ).toBeNull();
  });
});
