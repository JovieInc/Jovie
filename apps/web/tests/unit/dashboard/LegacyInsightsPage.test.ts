import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy dashboard insights redirect', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('preserves query params when redirecting to the canonical insights route', async () => {
    const { default: LegacyDashboardInsightsPage } = await import(
      '../../../app/app/(shell)/dashboard/insights/page'
    );

    await LegacyDashboardInsightsPage({
      searchParams: Promise.resolve({
        category: 'growth',
        priority: ['high', 'medium'],
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.INSIGHTS}?category=growth&priority=high&priority=medium`
    );
  });

  it('redirects to the canonical route when no query params are present', async () => {
    const { default: LegacyDashboardInsightsPage } = await import(
      '../../../app/app/(shell)/dashboard/insights/page'
    );

    await LegacyDashboardInsightsPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.INSIGHTS);
  });
});
