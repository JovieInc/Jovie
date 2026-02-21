import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

const sendMessageMock = vi.fn();
const maybeExecuteMock = vi.fn();
let onRejectHandler: (() => void) | undefined;

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: sendMessageMock,
    status: 'ready',
    setMessages: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/lib/pacer', () => ({
  useAsyncRateLimiter: (_fn: unknown, options: { onReject?: () => void }) => {
    onRejectHandler = options.onReject;
    return {
      maybeExecute: maybeExecuteMock,
      getRemainingInWindow: () => 1,
      state: { isExecuting: false },
    };
  },
}));

vi.mock('@/lib/queries/useChatConversationQuery', () => ({
  useChatConversationQuery: () => ({
    data: undefined,
    isLoading: false,
  }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useAddMessagesMutation: () => ({
    mutate: vi.fn(),
  }),
  useCreateConversationMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      conversation: { id: 'conv_123' },
    }),
  }),
}));

describe('useJovieChat rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMessageMock.mockReset();
    maybeExecuteMock.mockReset();
    onRejectHandler = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes submissions through async rate limiter and surfaces rate-limit feedback', () => {
    const { result } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    act(() => {
      result.current.setInput('Hello Jovie');
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(maybeExecuteMock).toHaveBeenCalledWith({
      text: 'Hello Jovie',
      files: undefined,
    });

    act(() => {
      result.current.setInput('');
    });

    act(() => {
      onRejectHandler?.();
    });

    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.chatError?.type).toBe('rate_limit');
    expect(result.current.chatError?.message).toContain('too quickly');

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.isRateLimited).toBe(false);
  });
});
