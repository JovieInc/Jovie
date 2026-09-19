import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileViewTracker } from './ProfileViewTracker';

const mockTrack = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: () => ({ mutate: vi.fn() }),
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('ProfileViewTracker', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 0;
    });
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits proof_viewed for the M1 proof profile and renders no chrome', () => {
    const { container } = renderWithQueryClient(
      <ProfileViewTracker handle='tim' artistId='artist-tim' />
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith(
      'proof_viewed',
      expect.objectContaining({
        campaignKey: 'proof-to-claim',
        profile_handle: 'tim',
      })
    );
  });
});
