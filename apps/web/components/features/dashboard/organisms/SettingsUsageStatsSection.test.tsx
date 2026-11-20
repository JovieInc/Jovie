import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { idleBillingQueries } from '@/tests/fixtures/idle-billing-queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsUsageStatsSection } from './SettingsUsageStatsSection';

const { usageQuery, refetch } = vi.hoisted(() => ({
  usageQuery: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('@/lib/queries', () => ({
  ...idleBillingQueries,
  useChatUsageQuery: () => usageQuery(),
}));

const usage: ChatUsageData = {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-10-08T07:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
};

function mockQuery(data: ChatUsageData | undefined, overrides = {}) {
  usageQuery.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch,
    ...overrides,
  });
}

function renderSection(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <SettingsUsageStatsSection />
      </div>
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsUsageStatsSection certificate', () => {
  it('shows the weekly meter and links to plan management', async () => {
    mockQuery(usage);
    const { container } = renderSection();

    expect(screen.getByText('Weekly Messages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Plan' })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_BILLING
    );
    await expectNoA11yViolations(container);
  });

  it('retries an unavailable balance and shows the verified result', async () => {
    const user = userEvent.setup();
    mockQuery(undefined, { error: new Error('Failed to fetch') });
    refetch.mockImplementation(async () => {
      mockQuery(usage);
      return { data: usage, error: null };
    });
    const { container } = renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('Usage unavailable');
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(await screen.findByText('Weekly Messages')).toBeInTheDocument();
  });

  it('marks a cached balance as out of date when the refetch failed', async () => {
    mockQuery(usage, { error: new Error('Failed to fetch') });
    const { container } = renderSection();

    expect(screen.getByText('Last Known Weekly Messages')).toBeInTheDocument();
    expect(screen.getByText('Usage may be out of date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('offers the upgrade when a paid plan is exhausted', async () => {
    mockQuery({ ...usage, used: 70, remaining: 0, isExhausted: true });
    const { container } = renderSection();

    expect(
      screen.queryByRole('link', { name: 'Manage Plan' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      APP_ROUTES.PRICING
    );
    await expectNoA11yViolations(container);
  });

  it('keeps loading, empty and RTL states accessible', async () => {
    mockQuery(undefined, { isLoading: true });
    const loading = renderSection();
    expect(
      screen.getByRole('status', { name: 'Loading Usage' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    mockQuery({ ...usage, used: 0, remaining: 70 });
    const empty = renderSection('rtl');
    expect(screen.getByText('Weekly Messages')).toBeInTheDocument();
    await expectNoA11yViolations(empty.container);
  });
});
