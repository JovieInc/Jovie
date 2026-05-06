'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

export interface CreateSmsIntentInput {
  artistId: string;
  source?: string;
  sourceUrl?: string;
}

export interface CreateSmsIntentResponse {
  success: true;
  intent_id: string;
  code: string;
  sms_href: string | null;
  sms_to: string | null;
  expires_at: string;
  consent_version: string;
}

interface CreateSmsIntentErrorResponse {
  success: false;
  error: string;
  code?: string;
}

export interface SmsIntentStatusResponse {
  success: true;
  status:
    | 'created'
    | 'sms_received'
    | 'confirmed'
    | 'expired'
    | 'consumed'
    | 'blocked'
    | 'unknown';
  subscribed: boolean;
  phone_masked?: string | null;
  expires_at?: string;
}

async function createSmsIntent(
  input: CreateSmsIntentInput,
  signal?: AbortSignal
): Promise<CreateSmsIntentResponse> {
  const response = await fetch('/api/notifications/sms-intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist_id: input.artistId,
      source: input.source ?? 'profile_bell',
      source_url: input.sourceUrl,
    }),
    signal,
  });

  const json = (await response.json()) as
    | CreateSmsIntentResponse
    | CreateSmsIntentErrorResponse;

  if (!response.ok || json.success === false) {
    const message =
      'success' in json && json.success === false
        ? json.error
        : 'Failed to create SMS intent';
    const error = new Error(message);
    if ('code' in json && json.code) {
      (error as Error & { code?: string }).code = json.code;
    }
    throw error;
  }

  return json;
}

async function fetchSmsIntentStatus(
  intentId: string,
  signal?: AbortSignal
): Promise<SmsIntentStatusResponse> {
  const response = await fetch(
    `/api/notifications/sms-intents/${intentId}/status`,
    {
      method: 'GET',
      signal,
    }
  );
  const json = (await response.json()) as SmsIntentStatusResponse;
  if (!response.ok) {
    throw new Error('Failed to read SMS intent status');
  }
  return json;
}

export function useCreateSmsIntentMutation() {
  return useMutation({
    mutationFn: (input: CreateSmsIntentInput) => createSmsIntent(input),
  });
}

export function useSmsIntentStatusQuery(input: {
  intentId: string | null;
  enabled: boolean;
  pollIntervalMs?: number;
}) {
  const { intentId, enabled, pollIntervalMs = 2000 } = input;
  return useQuery<SmsIntentStatusResponse, Error>({
    queryKey: ['notifications', 'sms-intent', 'status', intentId],
    queryFn: ({ signal }) => {
      if (!intentId) {
        return Promise.reject(new Error('intent_id required'));
      }
      return fetchSmsIntentStatus(intentId, signal);
    },
    enabled: enabled && Boolean(intentId),
    refetchInterval: query => {
      const data = query.state.data;
      if (data?.status === 'confirmed' || data?.status === 'expired') {
        return false;
      }
      return pollIntervalMs;
    },
    staleTime: 0,
    gcTime: 60_000,
  });
}
