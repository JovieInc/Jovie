import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('@/lib/queries/fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries/fetch')>()),
  fetchWithTimeout: mockFetch,
}));

import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import {
  getOutboundDecisionErrorMessage,
  OUTBOUND_ENDPOINT,
  useOutboundCertificationQuery,
  useOutboundDecisionMutation,
  useOutboundFactReviewMutation,
  useOutboundQueueQuery,
  useOutboundRefreshEvidenceMutation,
} from '@/lib/queries/useOutboundQuery';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

describe('outbound queries', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('loads the queue from the admin endpoint', async () => {
    mockFetch.mockResolvedValue({ rows: [], counts: {}, generatedAt: '' });
    const { wrapper } = setup();
    const { result } = renderHook(() => useOutboundQueueQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      OUTBOUND_ENDPOINT,
      expect.objectContaining({ timeout: 20_000 })
    );
  });

  it('only loads per-fact certification for a selected lead', async () => {
    mockFetch.mockResolvedValue({ certification: null });
    const { wrapper } = setup();
    const idle = renderHook(() => useOutboundCertificationQuery(null), {
      wrapper,
    });
    expect(idle.result.current.fetchStatus).toBe('idle');
    const selected = renderHook(() => useOutboundCertificationQuery('lead-1'), {
      wrapper,
    });
    await waitFor(() => expect(selected.result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      `${OUTBOUND_ENDPOINT}?lead=lead-1`,
      expect.anything()
    );
  });

  it('posts decisions and refreshes the queue', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useOutboundDecisionMutation(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({
        action: 'hold',
        items: [{ leadId: 'lead-1', expectedTargetRevision: 'rev' }],
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      OUTBOUND_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'hold',
          items: [{ leadId: 'lead-1', expectedTargetRevision: 'rev' }],
        }),
      })
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.admin.outbound(),
    });
  });

  it('records facts through the canonical contacts endpoint', async () => {
    mockFetch.mockResolvedValue({ certification: {} });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useOutboundFactReviewMutation(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ action: 'review_evidence' }));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/contacts',
      expect.objectContaining({ method: 'POST' })
    );
    expect(invalidate).toHaveBeenCalled();
  });

  it('surfaces the server refusal message', () => {
    expect(
      getOutboundDecisionErrorMessage(
        new FetchError('409', 409, undefined, {
          error: 'Certify the current profile facts before approving outreach.',
        })
      )
    ).toBe('Certify the current profile facts before approving outreach.');
    expect(getOutboundDecisionErrorMessage(new Error('x'))).toBe(
      'The decision could not be recorded. Try again.'
    );
  });

  it('refreshes evidence through the lead route and reloads the queue', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useOutboundRefreshEvidenceMutation(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync('lead-1'));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/leads/lead-1/refresh-evidence',
      { method: 'POST' }
    );
    expect(invalidate).toHaveBeenCalled();
  });
});
