'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

interface DeleteAccountInput {
  confirmation: string;
}

interface DeleteAccountResponse {
  success?: boolean;
  error?: string;
}

async function deleteAccount(
  input: DeleteAccountInput
): Promise<DeleteAccountResponse> {
  return fetchWithTimeout<DeleteAccountResponse>('/api/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function useDeleteAccountMutation() {
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      handleMutationSuccess('Account deleted. You will be signed out.');
    },
    onError: (error: unknown) => {
      handleMutationError(error, 'Failed to delete account');
    },
  });
}

export function useExportDataMutation() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/account/export');
      if (!response.ok) {
        throw new Error('Failed to export data');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jovie-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      handleMutationSuccess('Data export downloaded');
    },
    onError: (error: unknown) => {
      handleMutationError(error, 'Failed to export data');
    },
  });
}
