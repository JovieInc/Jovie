import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSettingsQuery = vi.fn();
const mockUpdateSettingsMutation = vi.fn();

vi.mock('@/lib/queries', async () => {
  const [fetchQueries, { queryKeys }] = await Promise.all([
    vi.importActual<typeof import('@/lib/queries/fetch')>(
      '@/lib/queries/fetch'
    ),
    vi.importActual<typeof import('@/lib/queries/keys')>('@/lib/queries/keys'),
  ]);

  return {
    isForbiddenError: fetchQueries.isForbiddenError,
    queryKeys,
    useLeadPipelineSettingsQuery: (...args: unknown[]) =>
      mockSettingsQuery(...args),
    useUpdateLeadPipelineSettingsMutation: () => mockUpdateSettingsMutation(),
  };
});

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: vi.fn(),
      addPasskey: vi.fn(),
    },
    signIn: { passkey: vi.fn() },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('GtmSpeedDial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it('shows admin verification state when the settings request is forbidden', async () => {
    const { FetchError } = await import('@/lib/queries/fetch');
    const { GtmSpeedDial } = await import('./GtmSpeedDial');
    mockSettingsQuery.mockReturnValue({
      data: undefined,
      error: new FetchError('Forbidden', 403),
      isLoading: false,
      isError: true,
    });

    renderWithProviders(<GtmSpeedDial />);

    expect(
      screen.getByText('Admin verification required to load pipeline settings.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  it('detects the matching speed preset for current settings', async () => {
    const { detectSpeed, getSpeedPreset } = await import('./GtmSpeedDial');
    type LeadPipelineSettings = Parameters<typeof detectSpeed>[0];

    expect(detectSpeed(getSpeedPreset('normal') as LeadPipelineSettings)).toBe(
      'normal'
    );
    expect(
      detectSpeed({
        enabled: true,
        discoveryEnabled: true,
        autoIngestEnabled: true,
        dailySendCap: 7,
        maxPerHour: 3,
        dailyQueryBudget: 42,
      } as LeadPipelineSettings)
    ).toBe('custom');
  });
});
