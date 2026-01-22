import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationsPage from '../../../../app/[username]/notifications/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ username: 'testartist' }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const fetchMock = vi.fn();

global.fetch = fetchMock as unknown as typeof fetch;

describe('NotificationsPage', () => {
  const renderPage = async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <NotificationsPage />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
  });

  it('shows artist not found state when creator lookup fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-artist-missing')
      ).toBeInTheDocument();
    });
  });

  it('subscribes successfully and shows success state', async () => {
    fetchMock.mockImplementation(url => {
      if (String(url).includes('/api/creator')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'artist-1' }),
        });
      }
      if (String(url).includes('/api/notifications/subscribe')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await renderPage();

    const emailInput = await screen.findByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: 'User@Example.com ' } });

    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    await waitFor(() => {
      expect(screen.getByTestId('notifications-success')).toBeInTheDocument();
    });
  });
});
