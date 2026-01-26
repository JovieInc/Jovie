'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { captureWarning } from '@/lib/error-tracking';
import {
  getNotificationStatus,
  type NotificationStatusPayload,
  type NotificationSubscribePayload,
  type NotificationUnsubscribePayload,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '@/lib/notifications/client';
import type {
  NotificationStatusResponse,
  NotificationSubscribeResponse,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

import { queryKeys } from './keys';

// STANDARD_CACHE values (5 min stale, 30 min gc)
const MINUTE = 60 * 1000;

/**
 * Exponential backoff retry delay for failed queries
 * Starts at 1s, doubles each retry, max 30s
 */
function getRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

type StatusInput = NotificationStatusPayload & { enabled?: boolean };

export function useNotificationStatusQuery({
  artistId,
  email,
  phone,
  enabled = true,
}: StatusInput) {
  const emailValue = email ?? null;
  const phoneValue = phone ?? null;

  return useQuery({
    queryKey: queryKeys.notifications.status({
      artistId,
      email: emailValue,
      phone: phoneValue,
    }),
    queryFn: () =>
      getNotificationStatus({
        artistId,
        email: emailValue ?? undefined,
        phone: phoneValue ?? undefined,
      }) as Promise<NotificationStatusResponse>,
    enabled: enabled && Boolean(emailValue || phoneValue),
    staleTime: 5 * MINUTE,
    gcTime: 30 * MINUTE,
    retry: 2,
    retryDelay: getRetryDelay,
    // Prevent throwing on error - handle gracefully
    throwOnError: false,
    meta: {
      errorMessage: 'Failed to fetch notification status',
    },
  });
}

export function useSubscribeNotificationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NotificationSubscribePayload) =>
      subscribeToNotifications(input) as Promise<NotificationSubscribeResponse>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.status({
          artistId: variables.artistId,
          email: variables.email ?? null,
          phone: variables.phone ?? null,
        }),
      });
    },
    onError: (error, variables) => {
      // Log subscription errors to monitoring (non-blocking)
      void captureWarning('Notification subscribe mutation failed', {
        error,
        artistId: variables.artistId,
        channel: variables.channel,
        source: variables.source,
      });
    },
    retry: 1,
    retryDelay: getRetryDelay,
  });
}

export function useUnsubscribeNotificationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NotificationUnsubscribePayload) =>
      unsubscribeFromNotifications(
        input
      ) as Promise<NotificationUnsubscribeResponse>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.status({
          artistId: variables.artistId,
          email: variables.email ?? null,
          phone: variables.phone ?? null,
        }),
      });
    },
    onError: (error, variables) => {
      // Log unsubscribe errors to monitoring (non-blocking)
      void captureWarning('Notification unsubscribe mutation failed', {
        error,
        artistId: variables.artistId,
        channel: variables.channel,
        method: variables.method,
      });
    },
    retry: 1,
    retryDelay: getRetryDelay,
  });
}
