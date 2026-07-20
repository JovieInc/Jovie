import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

// JOV-3525 — chat streaming cadence (client half): the useChat hook must batch
// streaming UI updates via the AI SDK v6 `experimental_throttle` option so raw
// token deltas don't re-render the timeline on every burst. Pairs with the
// server-side smoothStream transform (see run.stream-smoothing.test.ts).

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

const useChatMock = vi.fn(() => ({
  messages: [],
  sendMessage: vi.fn(),
  status: 'ready' as const,
  setMessages: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) => useChatMock(options),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-pacer', () => ({
  useAsyncRateLimiter: (
    fn: (args: { text: string }) => Promise<void>,
    _options: { onReject?: () => void }
  ) => ({
    maybeExecute: (args: { text: string }) => fn(args),
    getRemainingInWindow: () => 1,
    state: { isExecuting: false },
  }),
}));

vi.mock('@/lib/queries/useChatConversationQuery', () => ({
  useChatConversationQuery: () => ({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
  }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useAddMessagesMutation: () => ({ mutate: vi.fn() }),
  useCreateConversationMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ conversation: { id: 'conv_1' } }),
  }),
}));

describe('useJovieChat — streaming cadence (JOV-3525)', () => {
  it('configures useChat with a 50ms experimental_throttle (~20fps UI updates)', () => {
    renderHook(() => useJovieChat({ profileId: 'profile_1' }));

    expect(useChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ experimental_throttle: 50 })
    );
  });
});
