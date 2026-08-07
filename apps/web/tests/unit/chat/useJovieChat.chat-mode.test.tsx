import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

const { transportBodies } = vi.hoisted(() => ({
  transportBodies: [] as Array<Record<string, unknown> | undefined>,
}));

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    DefaultChatTransport: vi.fn().mockImplementation(function (
      this: unknown,
      options: { body?: Record<string, unknown> }
    ) {
      transportBodies.push(options.body);
      return { kind: 'mock-transport' };
    }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    setMessages: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-pacer', () => ({
  useAsyncRateLimiter: () => ({
    maybeExecute: vi.fn(),
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
  useAddMessagesMutation: () => ({
    mutate: vi.fn(),
  }),
  useCreateConversationMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe('useJovieChat chatMode transport body', () => {
  beforeEach(() => {
    transportBodies.length = 0;
  });

  it("includes chatMode: 'ov' in the request body when set", () => {
    renderHook(() => useJovieChat({ profileId: 'profile_1', chatMode: 'ov' }));

    expect(transportBodies.length).toBeGreaterThan(0);
    for (const body of transportBodies) {
      expect(body).toMatchObject({ profileId: 'profile_1', chatMode: 'ov' });
    }
  });

  it('omits chatMode from the request body in customer mode', () => {
    renderHook(() => useJovieChat({ profileId: 'profile_1' }));

    expect(transportBodies.length).toBeGreaterThan(0);
    for (const body of transportBodies) {
      expect(body).toMatchObject({ profileId: 'profile_1' });
      expect(body).not.toHaveProperty('chatMode');
    }
  });
});
