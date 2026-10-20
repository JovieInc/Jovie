import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirmChatLinkMutation } from './useConfirmChatLinkMutation';

const { handleError } = vi.hoisted(() => ({ handleError: vi.fn() }));
vi.mock('./mutation-utils', () => ({ handleMutationError: handleError }));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('chat link receipt transport', () => {
  it('decodes the remote receipt and preserves the reconciliation identity', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        platform: 'spotify',
        outcome: 'created',
        linkId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        receipt: {
          scopeId: 'profile-1',
          requestId: 'request-1',
          objectId: 'link-1',
          revision: 1,
          durability: 'remote',
        },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useConfirmChatLinkMutation, {
      wrapper: Wrapper,
    });
    await act(async () => {
      const response = await result.current.mutateAsync({
        profileId: 'profile-1',
        requestId: 'request-1',
        platform: 'spotify',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        reconcile: true,
      });
      expect(response.receipt?.durability).toBe('remote');
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      requestId: 'request-1',
      reconcile: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed success without automatic mutation retry or a misleading toast', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useConfirmChatLinkMutation, {
      wrapper: Wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          profileId: 'profile-1',
          requestId: 'request-1',
          platform: 'spotify',
          url: 'https://example.com',
          normalizedUrl: 'https://example.com',
        })
      ).rejects.toMatchObject({ kind: 'decode' });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(handleError).not.toHaveBeenCalled();
  });
});
