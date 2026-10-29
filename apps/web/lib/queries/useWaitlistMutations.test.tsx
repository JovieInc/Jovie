import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from './keys';
import {
  useApproveWaitlistMutation,
  useDisapproveWaitlistMutation,
  useResendWaitlistInviteMutation,
  useUpdateWaitlistStatusMutation,
} from './useWaitlistMutations';

const entryId = 'w1';
const actions = [
  {
    name: 'approve',
    endpoint: 'approve',
    fallback: 'Failed to approve waitlist entry',
    input: { entryId },
    useAction() {
      const mutation = useApproveWaitlistMutation();
      return () => mutation.mutateAsync({ entryId });
    },
  },
  {
    name: 'revoke',
    endpoint: 'disapprove',
    fallback: 'Failed to disapprove waitlist entry',
    input: { entryId },
    useAction() {
      const mutation = useDisapproveWaitlistMutation();
      return () => mutation.mutateAsync({ entryId });
    },
  },
  {
    name: 'update status',
    endpoint: 'update-status',
    fallback: 'Failed to update waitlist status',
    input: { entryId, status: 'qualified' },
    useAction() {
      const mutation = useUpdateWaitlistStatusMutation();
      return () => mutation.mutateAsync({ entryId, status: 'qualified' });
    },
  },
  {
    name: 'resend invite',
    endpoint: 'resend-invite',
    fallback: 'Failed to resend waitlist invite',
    input: { entryId },
    useAction() {
      const mutation = useResendWaitlistInviteMutation();
      return () => mutation.mutateAsync({ entryId });
    },
  },
];

describe.each(actions)('waitlist $name mutation', action => {
  let queryClient: QueryClient;
  const fetch = vi.fn<typeof globalThis.fetch>();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('preserves the server reason from an unsuccessful HTTP response', async () => {
    const reason = 'No auth record found for this email. Sign in first.';
    fetch.mockResolvedValue(Response.json({ error: reason }, { status: 422 }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(action.useAction, { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current()).rejects.toThrow(reason);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${APP_ROUTES.ADMIN_WAITLIST}/${action.endpoint}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(action.input),
      })
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.waitlist.all,
    });
  });

  it.each([undefined, '', '   ', 42])(
    'uses the action fallback when the HTTP error has no usable reason (%j)',
    async error => {
      fetch.mockResolvedValue(Response.json({ error }, { status: 500 }));
      const { result } = renderHook(action.useAction, { wrapper: Wrapper });

      await act(async () => {
        await expect(result.current()).rejects.toThrow(action.fallback);
      });
    }
  );

  it('preserves application errors in a successful HTTP response', async () => {
    const reason = 'This entry is no longer eligible.';
    fetch.mockResolvedValue(Response.json({ success: false, error: reason }));
    const { result } = renderHook(action.useAction, { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current()).rejects.toThrow(reason);
    });
  });

  it('preserves network errors', async () => {
    const error = new Error('Connection lost');
    fetch.mockRejectedValue(error);
    const { result } = renderHook(action.useAction, { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current()).rejects.toBe(error);
    });
  });

  it('returns the successful status and refreshes waitlist queries', async () => {
    fetch.mockResolvedValue(
      Response.json({ success: true, status: 'invited' })
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(action.useAction, { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current()).resolves.toEqual({
        success: true,
        status: 'invited',
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.waitlist.all,
    });
  });
});
