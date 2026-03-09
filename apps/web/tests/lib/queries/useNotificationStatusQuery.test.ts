import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invalidateQueriesMock,
  useMutationMock,
  useQueryClientMock,
  useQueryMock,
} = vi.hoisted(() => {
  const invalidateQueries = vi.fn();
  const useMutation = vi.fn(options => options);
  const useQueryClient = vi.fn(() => ({
    invalidateQueries,
  }));
  const useQuery = vi.fn();

  return {
    invalidateQueriesMock: invalidateQueries,
    useMutationMock: useMutation,
    useQueryClientMock: useQueryClient,
    useQueryMock: useQuery,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
  useQueryClient: useQueryClientMock,
}));

import { queryKeys } from '@/lib/queries/keys';

function getLastMutationOptions() {
  const lastCall = useMutationMock.mock.calls.at(-1);
  expect(lastCall).toBeDefined();

  return lastCall?.[0];
}

import {
  useNotificationStatusQuery,
  useSubscribeNotificationsMutation,
  useUnsubscribeNotificationsMutation,
  useUpdateContentPreferencesMutation,
  useVerifyEmailOtpMutation,
} from '@/lib/queries/useNotificationStatusQuery';

describe('useNotificationStatusQuery', () => {
  beforeEach(() => {
    invalidateQueriesMock.mockReset();
    useMutationMock.mockClear();
    useQueryClientMock.mockClear();
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({});
  });

  it('disables mount and focus refetching for notification status', () => {
    useNotificationStatusQuery({
      artistId: 'artist_123',
      email: 'user@example.com',
    });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      })
    );
  });

  it('invalidates notification status on subscribe success', () => {
    useSubscribeNotificationsMutation();
    const mutationOptions = getLastMutationOptions();

    mutationOptions?.onSuccess?.(undefined, {
      artistId: 'artist_123',
      email: 'user@example.com',
      channel: 'email',
      source: 'profile_modal',
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.notifications.status({
          artistId: 'artist_123',
          email: 'user@example.com',
          phone: null,
        }),
      })
    );
  });

  it('invalidates notification status on unsubscribe success', () => {
    useUnsubscribeNotificationsMutation();
    const mutationOptions = getLastMutationOptions();

    mutationOptions?.onSuccess?.(undefined, {
      artistId: 'artist_123',
      phone: '+15551234567',
      channel: 'sms',
      method: 'token',
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.notifications.status({
          artistId: 'artist_123',
          email: null,
          phone: '+15551234567',
        }),
      })
    );
  });

  it('invalidates notification status on content preference success', () => {
    useUpdateContentPreferencesMutation();
    const mutationOptions = getLastMutationOptions();

    mutationOptions?.onSuccess?.(undefined, {
      artistId: 'artist_123',
      email: 'user@example.com',
      contentTypes: ['new-music'],
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.notifications.status({
          artistId: 'artist_123',
          email: 'user@example.com',
          phone: null,
        }),
      })
    );
  });

  it('invalidates notification status on email verification success', () => {
    useVerifyEmailOtpMutation();
    const mutationOptions = getLastMutationOptions();

    mutationOptions?.onSuccess?.(undefined, {
      artistId: 'artist_123',
      email: 'user@example.com',
      otpCode: '123456',
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.notifications.status({
          artistId: 'artist_123',
          email: 'user@example.com',
          phone: null,
        }),
      })
    );
  });
});
