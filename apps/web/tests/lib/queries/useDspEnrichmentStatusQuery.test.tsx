import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EnrichmentPhase,
  type EnrichmentStatus,
  useDspEnrichmentStatusQuery,
} from '@/lib/queries/useDspEnrichmentStatusQuery';

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

function createStatus(
  phase: EnrichmentPhase,
  profileId = 'profile-123'
): EnrichmentStatus {
  return {
    profileId,
    overallPhase: phase,
    overallProgress: phase === 'complete' ? 100 : 50,
    providers: [],
    discoveryStartedAt: '2026-03-30T00:00:00Z',
    discoveryCompletedAt:
      phase === 'discovering' ? null : '2026-03-30T00:01:00Z',
    enrichmentStartedAt: phase === 'idle' ? null : '2026-03-30T00:00:30Z',
    enrichmentCompletedAt: phase === 'complete' ? '2026-03-30T00:02:00Z' : null,
  };
}

function createResponse(status: EnrichmentStatus) {
  return {
    ok: true,
    json: async () => ({ success: true, status }),
  } as Response;
}

describe('useDspEnrichmentStatusQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  it.each([
    ['discovering', 'matching'],
    ['matching', 'complete'],
    ['enriching', 'complete'],
  ] as const)('calls onComplete when phase transitions from %s to %s', async (fromPhase, toPhase) => {
    const onComplete = vi.fn();

    mockFetch.mockResolvedValueOnce(createResponse(createStatus(fromPhase)));

    const { result } = renderHook(
      () =>
        useDspEnrichmentStatusQuery({
          profileId: 'profile-123',
          onComplete,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onComplete).not.toHaveBeenCalled();

    mockFetch.mockResolvedValueOnce(createResponse(createStatus(toPhase)));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('does not call onComplete when the phase does not change', async () => {
    const onComplete = vi.fn();

    mockFetch.mockResolvedValueOnce(
      createResponse(createStatus('discovering'))
    );

    const { result } = renderHook(
      () =>
        useDspEnrichmentStatusQuery({
          profileId: 'profile-123',
          onComplete,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mockFetch.mockResolvedValueOnce(
      createResponse(createStatus('discovering'))
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not call onComplete when discovery fails', async () => {
    const onComplete = vi.fn();

    mockFetch.mockResolvedValueOnce(
      createResponse(createStatus('discovering'))
    );

    const { result } = renderHook(
      () =>
        useDspEnrichmentStatusQuery({
          profileId: 'profile-123',
          onComplete,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mockFetch.mockResolvedValueOnce(createResponse(createStatus('failed')));

    await act(async () => {
      await result.current.refetch();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not call onComplete when switching to a different profile', async () => {
    const onComplete = vi.fn();

    mockFetch.mockResolvedValueOnce(
      createResponse(createStatus('discovering', 'profile-123'))
    );

    const { result, rerender } = renderHook(
      ({ profileId }: { profileId: string }) =>
        useDspEnrichmentStatusQuery({
          profileId,
          onComplete,
        }),
      {
        initialProps: { profileId: 'profile-123' },
        wrapper,
      }
    );

    await waitFor(() =>
      expect(result.current.data?.profileId).toBe('profile-123')
    );

    mockFetch.mockResolvedValueOnce(
      createResponse(createStatus('complete', 'profile-456'))
    );

    rerender({ profileId: 'profile-456' });

    await waitFor(() =>
      expect(result.current.data?.profileId).toBe('profile-456')
    );
    expect(onComplete).not.toHaveBeenCalled();
  });
});
