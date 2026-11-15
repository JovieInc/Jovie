import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsPaySection } from './SettingsPaySection';

const { push, replace, open, refetch, summaryState } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  open: vi.fn(),
  refetch: vi.fn(),
  summaryState: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/settings/profile',
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams('tab=earn'),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ open }),
}));
vi.mock('@/lib/queries', () => ({
  useProfileMonetizationSummary: () => ({ ...summaryState, refetch }),
}));

const summary = (
  overrides: Partial<ProfileMonetizationSummaryResponse>
): ProfileMonetizationSummaryResponse => ({
  paymentState: 'not_setup',
  provider: 'none',
  manageHref: APP_ROUTES.SETTINGS_PAYMENTS,
  tipUrl: null,
  tipVisits: 0,
  tipsReceived: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
  narrative: 'Fans cannot pay until payouts are configured.',
  ...overrides,
});

function renderSection(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <SettingsPaySection />
      </div>
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  summaryState.data = undefined;
  summaryState.isError = false;
  summaryState.isLoading = false;
});

describe('SettingsPaySection certificate', () => {
  it('routes payment setup to the payments settings page', async () => {
    const user = userEvent.setup();
    summaryState.data = summary({});
    const { container } = renderSection();

    expect(screen.getByText('Payments Off')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Set Up Payments/ }));
    expect(push).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_PAYMENTS);
    expect(open).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('manages an incomplete setup at its manage link', async () => {
    const user = userEvent.setup();
    summaryState.data = summary({
      paymentState: 'setup_incomplete',
      provider: 'stripe',
      narrative: 'Connected, payouts are not live yet.',
    });
    renderSection();

    await user.click(screen.getByRole('button', { name: /Complete Setup/ }));
    expect(push).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_PAYMENTS);
  });

  it('focuses the username field when the profile URL is missing', async () => {
    const user = userEvent.setup();
    summaryState.data = summary({
      paymentState: 'needs_profile_url',
      narrative: 'Pay links and QR codes need a public profile URL.',
    });
    const input = document.createElement('input');
    input.id = 'username';
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);
    renderSection();

    await user.click(screen.getByRole('button', { name: /Set Username/ }));
    expect(input).toHaveFocus();
    input.remove();
  });

  it('shows a loading skeleton and a retryable error', async () => {
    const user = userEvent.setup();
    summaryState.isLoading = true;
    const loading = renderSection();
    expect(screen.getByTestId('settings-pay-loading')).toBeInTheDocument();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    summaryState.isLoading = false;
    summaryState.isError = true;
    const failed = renderSection();
    expect(
      screen.getByText('Could not load your payments summary right now.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetch).toHaveBeenCalledOnce();
    await expectNoA11yViolations(failed.container);
  });

  it('renders a live summary inside an RTL document', async () => {
    summaryState.data = summary({
      paymentState: 'ready_no_activity',
      provider: 'venmo',
      tipUrl: 'https://jov.ie/story-artist/pay',
      narrative: 'No visits yet. Share your link or QR to start.',
    });
    const { container } = renderSection('rtl');
    expect(screen.getByText('Payments Live')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
