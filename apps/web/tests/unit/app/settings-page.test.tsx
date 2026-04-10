import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { captureExceptionMock, getDashboardDataMock, redirectMock } = vi.hoisted(
  () => ({
    captureExceptionMock: vi.fn(),
    getDashboardDataMock: vi.fn(),
    redirectMock: vi.fn(),
  })
);

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: 'user-1' }),
}));

vi.mock('../../../app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: getDashboardDataMock,
}));

vi.mock('@/features/dashboard/DashboardSettings', () => ({
  DashboardSettings: () => <div data-testid='dashboard-settings' />,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { readonly message: string }) => (
    <div data-testid='page-error-state'>{message}</div>
  ),
}));

async function renderSettingsPage({
  userId = 'user-1',
}: {
  readonly userId?: string | null;
}) {
  vi.resetModules();

  vi.doMock('@/lib/auth/cached', () => ({
    getCachedAuth: async () => ({ userId }),
  }));

  const { default: SettingsPage } = await import(
    '../../../app/app/(shell)/settings/page'
  );

  return SettingsPage();
}

describe('settings page', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('renders the canonical page error state when settings data fails to load', async () => {
    getDashboardDataMock.mockRejectedValueOnce(new Error('boom'));
    render(await renderSettingsPage({ userId: 'user-1' }));

    expect(screen.getByTestId('page-error-state')).toHaveTextContent(
      'Failed to load settings data. Please refresh the page.'
    );
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('renders dashboard settings when data loads successfully', async () => {
    getDashboardDataMock.mockResolvedValueOnce({
      needsOnboarding: false,
      dashboardLoadError: null,
    });
    render(await renderSettingsPage({ userId: 'user-1' }));

    expect(screen.getByTestId('dashboard-settings')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to sign-in', async () => {
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });

    await expect(renderSettingsPage({ userId: null })).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.SETTINGS}`
    );
    expect(getDashboardDataMock).not.toHaveBeenCalled();
  });
});
