import { vi } from 'vitest';

/**
 * Shared mock mutation factory for release-related hooks.
 * Used across ReleaseProviderMatrix test files to avoid duplication.
 */
export function makeMockMutation(mutateFn: ReturnType<typeof vi.fn>) {
  return {
    mutate: mutateFn,
    mutateAsync: vi.fn(),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
    status: 'idle' as const,
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    context: undefined,
  };
}
