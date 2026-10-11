import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchDecodeError } from '../fetch';
import {
  useExampleReleaseDetailQuery,
  useExampleReleaseRenameMutation,
} from './example-release-detail';

const fetchMock = vi.fn();

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('example-release-detail fixture', () => {
  it('binds resource params into the request URL and forwards the signal', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'rel-1', profileId: 'prof-1', title: 'EP' })
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useExampleReleaseDetailQuery('prof-1', 'rel-1'),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/releases/rel-1?profileId=prof-1');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes ids that contain reserved characters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'a/b', profileId: 'p 1', title: 'x' })
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useExampleReleaseDetailQuery('p 1', 'a/b'),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/releases/a%2Fb?profileId=p%201'
    );
  });

  it('rejects responses that fail the boundary decoder', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useExampleReleaseDetailQuery('prof-1', 'rel-1'),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(FetchDecodeError);
  });

  it('does not fire when a scope param is missing', () => {
    const queryClient = new QueryClient();
    renderHook(() => useExampleReleaseDetailQuery('', 'rel-1'), {
      wrapper: wrapper(queryClient),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('invalidates detail and matrix keys after a successful mutation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'rel-1', profileId: 'prof-1', title: 'New' })
    );
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useExampleReleaseRenameMutation('prof-1', 'rel-1'),
      { wrapper: wrapper(queryClient) }
    );

    result.current.mutate({ title: 'New' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/releases/rel-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'New' });

    const invalidated = invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey);
    expect(invalidated).toContainEqual([
      'releases',
      'detail',
      'prof-1',
      'rel-1',
    ]);
    expect(invalidated).toContainEqual(['releases', 'matrix', 'prof-1']);
  });
});
