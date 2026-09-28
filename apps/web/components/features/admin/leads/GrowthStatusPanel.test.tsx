import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSettingsQuery = vi.fn();
const mockUpdateSettingsMutation = vi.fn();

vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
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

async function getPanel() {
  const { GrowthStatusPanel } = await import(
    '@/components/features/admin/leads/GrowthStatusPanel'
  );
  return GrowthStatusPanel;
}

describe('GrowthStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it('stops loading and shows a retryable error on failure', async () => {
    mockSettingsQuery.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    const GrowthStatusPanel = await getPanel();
    renderWithProviders(<GrowthStatusPanel />);

    expect(
      screen.queryByText('Loading Growth status...')
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Unable to load Growth status/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Retry' }).length
    ).toBeGreaterThan(0);
  }, 30_000);

  it('shows admin verification state when the settings request is forbidden', async () => {
    const { FetchError } = await import('@/lib/queries/fetch');
    mockSettingsQuery.mockReturnValue({
      data: undefined,
      error: new FetchError('Forbidden', 403),
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    const GrowthStatusPanel = await getPanel();
    renderWithProviders(<GrowthStatusPanel />);

    expect(
      screen.queryByText('Loading Growth status...')
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Admin verification required/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Unlock' }).length
    ).toBeGreaterThan(0);
  }, 30_000);
});
