import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ACCOUNT_LOADING_FILL } from './account-loading-fill';
import { UsageMenuItem } from './UsageMenuItem';

// Focus-retention and cached-balance edge cases are covered in
// tests/unit/user-button/UsageMenuItem.test.tsx. This colocated file walks
// each rendered state (loading, unavailable, unverified, stale, upsell) with
// interactions and an axe audit of the expanded disclosure.
const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

const healthyPro: ChatUsageData = {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
};

const nearLimitFree: ChatUsageData = {
  plan: 'free',
  weeklyLimit: 15,
  used: 14,
  remaining: 1,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: true,
};

function mockQuery(query: Record<string, unknown>) {
  mockUseChatUsageQuery.mockReturnValue({
    data: undefined,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({ data: undefined, error: null }),
    ...query,
  });
}

async function expand() {
  await userEvent.click(
    screen.getByRole('button', { name: /usage remaining/i })
  );
}

describe('UsageMenuItem', () => {
  beforeEach(() => {
    mockUseChatUsageQuery.mockReset();
  });

  it('toggles the usage details disclosure', async () => {
    mockQuery({ data: healthyPro });
    const { container } = render(
      <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
    );

    const toggle = screen.getByRole('button', { name: /usage remaining/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('71%');
    // The toggle is a normal 32px menu row on the shared gutter, with its
    // gauge in the icon column.
    expect(toggle).toHaveClass('h-8', 'px-(--space-2-5)');
    expect(toggle).not.toHaveClass('rounded-none');
    expect(toggle.querySelector('svg')?.parentElement).toHaveClass(
      'w-4',
      'shrink-0',
      'justify-center'
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    await expand();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detailsId = toggle.getAttribute('aria-controls');
    expect(detailsId).toBeTruthy();
    expect(container.querySelector(`[id="${detailsId}"]`)).not.toBeNull();
    expect(screen.getByText('Weekly Messages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_USAGE
    );
    expect(
      screen.queryByRole('button', { name: 'Retry Usage' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    await expand();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder and no retry while the first read is in flight', async () => {
    mockQuery({ isLoading: true, isFetching: true });
    const { container } = render(
      <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
    );

    expect(screen.queryByText('—')).not.toBeInTheDocument();
    // The inline placeholder uses the fill that stays visible in light mode.
    expect(
      container.querySelector(
        `.${ACCOUNT_LOADING_FILL.replace('/', '\\/')}.animate-pulse`
      )
    ).not.toBeNull();
    await expand();
    expect(screen.getByText('Loading usage…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry Usage' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('offers a retry when usage could not be read at all', async () => {
    const refetch = vi
      .fn()
      .mockResolvedValue({ data: healthyPro, error: null });
    mockQuery({ error: new Error('usage unavailable'), refetch });
    const { container } = render(
      <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
    );

    expect(
      screen.getByRole('button', { name: /usage remaining/i })
    ).toHaveTextContent('—');
    await expand();
    expect(
      screen.getByText('Usage details are unavailable right now.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Retry Usage' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('says when the returned usage cannot be verified', async () => {
    mockQuery({ data: { ...healthyPro, weeklyLimit: Number.NaN } });
    const { container } = render(
      <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
    );

    await expand();
    expect(
      screen.getByText('Usage details could not be verified.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry Usage' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks a cached snapshot as possibly out of date', async () => {
    mockQuery({ data: { ...healthyPro, _stale: true } });
    const { container } = render(
      <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
    );

    expect(
      screen.getByRole('button', { name: /usage remaining/i })
    ).toHaveTextContent('71% (cached)');
    await expand();
    expect(screen.getByText('Usage may be out of date')).toBeInTheDocument();
    expect(screen.getByText('Last Known Weekly Messages')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('runs the free-plan upgrade handler when the balance is low', async () => {
    const onUpgrade = vi.fn();
    mockQuery({ data: nearLimitFree });
    const { container } = render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={onUpgrade}
        upgradeLabel='Get more messages'
      />
    );

    await expand();
    await expectNoA11yViolations(container);
    await userEvent.click(
      screen.getByRole('button', { name: 'Get more messages' })
    );
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('disables the upgrade action while it is opening', async () => {
    mockQuery({ data: nearLimitFree });
    render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={vi.fn()}
        isUpgradeLoading
      />
    );

    await expand();
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();
  });

  it('links paid plans near their limit to pricing instead of a handler', async () => {
    mockQuery({
      data: { ...healthyPro, used: 66, remaining: 4, isNearLimit: true },
    });
    render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={vi.fn()}
      />
    );

    await expand();
    const pricingLink = screen
      .getAllByRole('link')
      .find(link => link.getAttribute('href') === APP_ROUTES.PRICING);
    expect(pricingLink).toBeDefined();
  });
});
