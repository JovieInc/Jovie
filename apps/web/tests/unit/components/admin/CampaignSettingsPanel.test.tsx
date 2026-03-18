import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignSettingsPanel } from '@/features/admin/campaigns/CampaignSettingsPanel';

const mockUseCampaignSettings = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('@/lib/queries', () => ({
  DEFAULT_THROTTLING: {
    minDelayMs: 30000,
    maxDelayMs: 120000,
    maxPerHour: 30,
  },
  useCampaignSettings: (...args: unknown[]) => mockUseCampaignSettings(...args),
  useSaveCampaignSettings: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
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

describe('CampaignSettingsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseCampaignSettings.mockReset();
    mockMutateAsync.mockReset();
  });

  it('shows loading state while fetching settings', () => {
    mockUseCampaignSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderWithQueryClient(<CampaignSettingsPanel />);

    expect(
      screen.getByText('Loading campaign settings...')
    ).toBeInTheDocument();
  });

  it('shows error state when loading settings fails', () => {
    mockUseCampaignSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    });

    renderWithQueryClient(<CampaignSettingsPanel />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows fallback error message for non-Error objects', () => {
    mockUseCampaignSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: 'unknown',
    });

    renderWithQueryClient(<CampaignSettingsPanel />);

    expect(
      screen.getByText(
        'Unable to load campaign settings. Please refresh and try again.'
      )
    ).toBeInTheDocument();
  });

  it('renders settings controls after successful load', async () => {
    mockUseCampaignSettings.mockReturnValue({
      data: {
        ok: true,
        settings: {
          fitScoreThreshold: 60,
          batchLimit: 15,
          throttlingConfig: {
            minDelayMs: 30000,
            maxDelayMs: 120000,
            maxPerHour: 30,
          },
          updatedAt: null,
          updatedBy: null,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderWithQueryClient(<CampaignSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText('Campaign targeting & throttling')
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Minimum Fit Score')).toBeInTheDocument();
    expect(screen.getByLabelText('Batch Size')).toBeInTheDocument();
    expect(screen.getByLabelText('Min Delay (seconds)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Delay (seconds)')).toBeInTheDocument();
  });
});
