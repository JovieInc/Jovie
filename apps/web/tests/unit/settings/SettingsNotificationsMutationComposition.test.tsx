import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';

const { captureException, toastError, toastSuccess } = vi.hoisted(() => ({
  captureException: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock('@/components/feedback', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException,
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('SettingsNotificationsSection mutation composition', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const dashboardData = {
    selectedProfile: {
      id: 'profile-1',
      settings: { require_double_opt_in: false },
    },
  } as DashboardData;

  function shell(queryClient: QueryClient, show = true, value = dashboardData) {
    return (
      <QueryClientProvider client={queryClient}>
        <DashboardDataProvider value={value}>
          {show ? <SettingsNotificationsSection isGrowth /> : null}
        </DashboardDataProvider>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('Network unavailable'));
    toastError.mockReset();
    toastSuccess.mockReset();
    captureException.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the double opt-in payload, announces one failure, and rolls back', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    render(shell(queryClient));

    const toggle = screen.getByRole('switch', {
      name: 'Double Opt-in Verification',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledExactlyOnceWith(
        'Failed to save settings'
      );
    });
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/dashboard/profile');
    expect(options).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(options?.body))).toEqual({
      profileId: 'profile-1',
      updates: { settings: { require_double_opt_in: true } },
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledOnce();
  });

  it('keeps a successful value across a same-shell section remount', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { rerender } = render(shell(queryClient));

    fireEvent.click(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    );
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledExactlyOnceWith('Settings saved');
    });

    rerender(shell(queryClient, false));
    rerender(shell(queryClient));

    expect(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('does not apply a stale profile success to the newly selected profile', async () => {
    const request = deferredResponse();
    fetchMock.mockImplementation(() => request.promise);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const profileTwo = {
      selectedProfile: {
        id: 'profile-2',
        settings: { require_double_opt_in: false },
      },
    } as DashboardData;
    const { rerender } = render(shell(queryClient));

    fireEvent.click(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    );
    rerender(shell(queryClient, true, profileTwo));
    expect(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    ).toHaveAttribute('aria-checked', 'false');

    request.resolve(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledExactlyOnceWith('Settings saved');
    });

    expect(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    ).toHaveAttribute('aria-checked', 'false');
  });
});
