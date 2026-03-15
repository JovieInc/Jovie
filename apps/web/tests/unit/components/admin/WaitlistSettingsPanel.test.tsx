import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistSettingsPanel } from '@/components/admin/WaitlistSettingsPanel';

const toastError = vi.fn();

const mockUseWaitlistSettingsQuery = vi.fn();
const mockMutate = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/queries', () => ({
  useWaitlistSettingsQuery: (...args: unknown[]) =>
    mockUseWaitlistSettingsQuery(...args),
  useWaitlistSettingsMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('WaitlistSettingsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    mockUseWaitlistSettingsQuery.mockReset();
    mockMutate.mockReset();
  });

  it('renders settings controls after successful load', async () => {
    mockUseWaitlistSettingsQuery.mockReturnValue({
      data: {
        gateEnabled: true,
        autoAcceptEnabled: false,
        autoAcceptDailyLimit: 25,
        autoAcceptedToday: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderWithQueryClient(<WaitlistSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Waitlist gate controls')).toBeInTheDocument();
    });

    expect(screen.getByText('Today: 3')).toBeInTheDocument();
  });

  it('shows an error state when loading settings fails', async () => {
    mockUseWaitlistSettingsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: 'unknown error',
    });

    renderWithQueryClient(<WaitlistSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Unable to load waitlist settings. Please refresh and try again.'
        )
      ).toBeInTheDocument();
    });
  });
});
