'use client';

import { useMutation } from '@tanstack/react-query';

async function requestSmsAccess(): Promise<{ success: boolean }> {
  const response = await fetch('/api/sms-access-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error ?? 'Failed to request SMS access');
  }

  return response.json() as Promise<{ success: boolean }>;
}

export function useSmsAccessRequestMutation() {
  return useMutation({
    mutationFn: requestSmsAccess,
  });
}
