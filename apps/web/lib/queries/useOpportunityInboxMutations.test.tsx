import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpportunityInboxMutations } from './useOpportunityInboxMutations';

const { refresh, success, error } = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/components/feedback', () => ({ toast: { success, error } }));
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  vi.clearAllMocks();
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

describe('opportunity decision acknowledgements', () => {
  it.each(['approve', 'dismiss', 'revise'] as const)(
    'keeps %s pending without success before a receipt',
    async action => {
      let release!: (response: Response) => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>(resolve => {
              release = resolve;
            })
        )
      );
      const { result } = renderHook(useOpportunityInboxMutations, {
        wrapper: Wrapper,
      });
      act(() => {
        if (action === 'approve')
          result.current.approveMutation.mutate('decision-0');
        else if (action === 'dismiss')
          result.current.dismissMutation.mutate('decision-0');
        else
          result.current.reviseMutation.mutate({
            id: 'decision-0',
            comment: 'Keep my note',
          });
      });
      await waitFor(() =>
        expect(result.current[`${action}Mutation`].isPending).toBe(true)
      );
      expect(success).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      release(Response.json({ ok: true }));
      await waitFor(() =>
        expect(result.current[`${action}Mutation`].isSuccess).toBe(true)
      );
      expect(success).toHaveBeenCalledOnce();
      expect(refresh).toHaveBeenCalledOnce();
    }
  );
  it.each([
    ['approve', 409],
    ['approve', 503],
    ['dismiss', 409],
    ['dismiss', 503],
    ['revise', 409],
    ['revise', 503],
  ] as const)(
    'reconciles %s response %s without reporting success',
    async (action, status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ error: 'Changed or unavailable' }, { status })
          )
      );
      const { result } = renderHook(useOpportunityInboxMutations, {
        wrapper: Wrapper,
      });
      act(() => {
        if (action === 'approve')
          result.current.approveMutation.mutate('decision-0');
        else if (action === 'dismiss')
          result.current.dismissMutation.mutate('decision-0');
        else
          result.current.reviseMutation.mutate({
            id: 'decision-0',
            comment: 'Keep my note',
          });
      });
      await waitFor(() =>
        expect(result.current[`${action}Mutation`].isError).toBe(true)
      );
      expect(success).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(refresh).toHaveBeenCalledTimes(status === 409 ? 1 : 0);
    }
  );
});
