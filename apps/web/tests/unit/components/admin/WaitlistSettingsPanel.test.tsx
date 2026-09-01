import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistSettingsPanel } from '@/components/features/admin/WaitlistSettingsPanel';

const { mockMutate, mockUseWaitlistSettingsQuery, mutationState, toastError } =
  vi.hoisted(() => ({
    mockMutate: vi.fn(),
    mockUseWaitlistSettingsQuery: vi.fn(),
    mutationState: {
      isPending: false,
    },
    toastError: vi.fn(),
  }));

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
    isPending: mutationState.isPending,
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
    mutationState.isPending = false;
  });

  it('renders settings controls after successful load', async () => {
    mockUseWaitlistSettingsQuery.mockReturnValue({
      data: {
        gateEnabled: true,
        autoAcceptEnabled: false,
        autoAcceptAfterDays: 7,
        autoAcceptDailyLimit: 25,
        autoAcceptedToday: 3,
        autoAcceptResetsAt: '2026-09-02T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderWithQueryClient(<WaitlistSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('People Intake Defaults')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Set the approval rules for new people entering the pipeline.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Today: 3 people auto-approved')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('dims editable action rows while a settings save is pending', async () => {
    mutationState.isPending = true;
    mockUseWaitlistSettingsQuery.mockReturnValue({
      data: {
        gateEnabled: true,
        autoAcceptEnabled: true,
        autoAcceptAfterDays: 14,
        autoAcceptDailyLimit: 25,
        autoAcceptedToday: 3,
        autoAcceptResetsAt: '2026-09-02T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderWithQueryClient(<WaitlistSettingsPanel />);

    const autoAcceptAfter = await screen.findByText('Auto-accept after');
    const dailyLimit = screen.getByText('Daily limit');

    expect(autoAcceptAfter.closest('[data-state="disabled"]')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(dailyLimit.closest('[data-state="disabled"]')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(autoAcceptAfter).toHaveClass('text-(--color-text-disabled-token)');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Auto-accept after days')).toBeDisabled();
    expect(screen.getByLabelText('Daily auto-accept limit')).toBeDisabled();
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
