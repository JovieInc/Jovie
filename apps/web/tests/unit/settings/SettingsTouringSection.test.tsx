import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';

const { queryState, refetch } = vi.hoisted(() => ({
  queryState: {
    data: null as null | {
      connected: boolean;
      artistName: string | null;
      lastSyncedAt: string | null;
    },
    isLoading: false,
    isError: false,
  },
  refetch: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    tourDates: {
      connection: (profileId: string) => ['tour-dates', profileId],
    },
  },
  useBandsintownConnectionQuery: () => ({ ...queryState, refetch }),
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  connectBandsintownArtist: vi.fn(),
  disconnectBandsintown: vi.fn(),
  removeBandsintownApiKey: vi.fn(),
  saveBandsintownApiKey: vi.fn(),
  syncFromBandsintown: vi.fn(),
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsTouringSection profileId='profile-1' />
    </QueryClientProvider>
  );
}

describe('SettingsTouringSection', () => {
  beforeEach(() => {
    queryState.data = null;
    queryState.isLoading = false;
    queryState.isError = false;
    refetch.mockReset();
  });

  it('uses the canonical settings panel body for its loading state', () => {
    queryState.isLoading = true;
    renderSection();

    const panelBody = document.querySelector('.px-4.py-4');
    expect(panelBody).toHaveClass('sm:px-5');
    expect(panelBody?.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('preserves the recoverable error action', () => {
    queryState.isError = true;
    renderSection();

    expect(screen.getByText('Unable to load Bandsintown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps the disconnected action anatomy and copy', () => {
    queryState.data = {
      connected: false,
      artistName: null,
      lastSyncedAt: null,
    };
    renderSection();

    expect(screen.getByText('Bandsintown not connected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect bandsintown/i })
    ).toBeInTheDocument();
  });
});
