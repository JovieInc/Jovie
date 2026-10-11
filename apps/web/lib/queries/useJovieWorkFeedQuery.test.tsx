import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useJovieWorkFeedQuery } from './useJovieWorkFeedQuery';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./fetch', () => ({ fetchWithTimeout: mocks.fetch }));

const item = (id: string) => ({
  id,
  source: 'agent_run',
  phase: 'completed',
  title: id,
  description: 'Verified creator work.',
  icon: 'agent',
  timestamp: '2026-10-01T00:00:00Z',
  statusLabel: 'Done',
});
afterEach(() => vi.clearAllMocks());

describe('creator work query isolation', () => {
  it('binds each request to its profile key and discards a late previous-profile result', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    let resolveCurrent: ((value: unknown) => void) | undefined;
    mocks.fetch
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveCurrent = resolve;
          })
      );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      ({ profileId }) =>
        useJovieWorkFeedQuery({ profileId, completedOnly: true }),
      { wrapper, initialProps: { profileId: 'profile-a' } }
    );
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    hook.rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);
    expect(hook.result.current.data).toBeUndefined();
    expect(mocks.fetch.mock.calls[1][0]).toContain('profileId=profile-b');
    expect(mocks.fetch.mock.calls[1][0]).toContain('phase=completed');
    expect(mocks.fetch.mock.calls[1][1].cache).toBe('no-store');
    await act(async () => {
      resolveOld?.({ items: [item('old-founder-ops-healthcheck-context')] });
      resolveCurrent?.({ items: [item('current-creator-work')] });
    });
    await waitFor(() =>
      expect(hook.result.current.data?.[0]?.id).toBe('current-creator-work')
    );
    expect(JSON.stringify(hook.result.current.data)).not.toContain(
      'old-founder'
    );
    expect(client.getQueryCache().findAll()).toHaveLength(2);
    client.clear();
  });
  it('does not read when no creator profile is selected', () => {
    const client = new QueryClient();
    renderHook(() => useJovieWorkFeedQuery({ profileId: '' }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    client.clear();
  });
});
