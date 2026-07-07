import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

// Regression coverage for #11921: on a follow-up send, the AI SDK's "last
// assistant message" is still the PREVIOUS turn's reply until the new stream
// starts. The hook must never dispatch that stale content into the fresh
// assistant row (which flashed the old reply, then destructively re-rendered
// when the real stream began).

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

const sendMessageMock = vi.fn();
let mockStatus: 'ready' | 'submitted' | 'streaming' = 'ready';
let mockMessages: Array<{
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
  createdAt: Date;
}> = [];

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage: sendMessageMock,
    status: mockStatus,
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

const PREVIOUS_TURN_MESSAGES = [
  {
    id: 'sdk_user_1',
    role: 'user',
    parts: [{ type: 'text', text: 'First question' }],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: 'sdk_assistant_1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Previous turn reply' }],
    createdAt: new Date('2026-01-01T00:00:01.000Z'),
  },
];

function getLastAssistantRow(
  messages: readonly { role: string; status: string; parts: unknown[] }[]
) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return messages[i];
  }
  return undefined;
}

describe('useJovieChat stale-stream guard (#11921)', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    sendMessageMock.mockImplementation(() => undefined);
    mockStatus = 'ready';
    mockMessages = [...PREVIOUS_TURN_MESSAGES];
  });

  it('does not flash the previous reply into the new assistant row before the stream starts', async () => {
    const { result, rerender } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    await act(async () => {
      await result.current.submitMessage('Second question');
    });

    // SDK appends the outgoing user message; the new assistant message does
    // NOT exist yet — the last assistant in sdkMessages is the previous reply.
    mockMessages = [
      ...PREVIOUS_TURN_MESSAGES,
      {
        id: 'sdk_user_2',
        role: 'user',
        parts: [{ type: 'text', text: 'Second question' }],
        createdAt: new Date('2026-01-01T00:01:00.000Z'),
      },
    ];
    mockStatus = 'submitted';
    rerender();

    const assistantRow = getLastAssistantRow(result.current.messages);
    expect(assistantRow?.status).toBe('pending');
    expect(assistantRow?.parts).toEqual([]);
  });

  it('still applies deltas from the new turn assistant message once streaming starts', async () => {
    const { result, rerender } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    await act(async () => {
      await result.current.submitMessage('Second question');
    });

    mockMessages = [
      ...PREVIOUS_TURN_MESSAGES,
      {
        id: 'sdk_user_2',
        role: 'user',
        parts: [{ type: 'text', text: 'Second question' }],
        createdAt: new Date('2026-01-01T00:01:00.000Z'),
      },
      {
        id: 'sdk_assistant_2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Fresh tokens' }],
        createdAt: new Date('2026-01-01T00:01:01.000Z'),
      },
    ];
    mockStatus = 'streaming';
    rerender();

    const assistantRow = getLastAssistantRow(result.current.messages);
    expect(assistantRow?.status).toBe('streaming');
    expect(assistantRow?.parts).toEqual([
      { type: 'text', text: 'Fresh tokens' },
    ]);
  });
});
