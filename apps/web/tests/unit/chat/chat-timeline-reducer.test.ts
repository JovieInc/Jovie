import { describe, expect, it } from 'vitest';

import {
  createInitialChatTimelineState,
  reduceChatTimeline,
  selectRenderableMessages,
} from '@/components/jovie/timeline/chat-timeline';

function textPart(text: string) {
  return { type: 'text' as const, text };
}

describe('chat timeline reducer', () => {
  it('keeps optimistic user and assistant rows visible while a send is slow', () => {
    const state = reduceChatTimeline(createInitialChatTimelineState(), {
      type: 'message.send.started',
      conversationId: null,
      clientTurnId: 'turn_client_1',
      clientMessageId: 'turn_client_1:user',
      requestId: 'req_1',
      parts: [textPart('Hello Jovie')],
      now: 100,
    });

    expect(selectRenderableMessages(state)).toMatchObject([
      {
        id: 'user:turn_client_1',
        role: 'user',
        status: 'sending',
      },
      {
        id: 'assistant:turn_client_1',
        role: 'assistant',
        status: 'pending',
      },
    ]);
  });

  it('reconciles server acknowledgement without changing render keys', () => {
    const sending = reduceChatTimeline(createInitialChatTimelineState(), {
      type: 'message.send.started',
      conversationId: null,
      clientTurnId: 'turn_client_1',
      clientMessageId: 'turn_client_1:user',
      requestId: 'req_1',
      parts: [textPart('Hello Jovie')],
      now: 100,
    });

    const acknowledged = reduceChatTimeline(sending, {
      type: 'message.send.acknowledged',
      conversationId: 'conv_server',
      clientTurnId: 'turn_client_1',
      turnId: 'turn_server',
      requestId: 'req_server',
      serverUserMessageId: 'msg_user_server',
      now: 150,
    });

    expect(
      selectRenderableMessages(acknowledged).map(message => message.id)
    ).toEqual(['user:turn_client_1', 'assistant:turn_client_1']);
    expect(selectRenderableMessages(acknowledged)).toMatchObject([
      {
        status: 'sent',
        serverMessageId: 'msg_user_server',
        turnId: 'turn_server',
      },
      {
        status: 'pending',
        turnId: 'turn_server',
      },
    ]);
  });

  it('updates one assistant row for all stream deltas', () => {
    const acknowledged = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'message.send.acknowledged',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        now: 125,
      }
    );

    const streaming = reduceChatTimeline(
      reduceChatTimeline(acknowledged, {
        type: 'assistant.stream.delta',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Hel')],
        revision: 1,
        now: 200,
      }),
      {
        type: 'assistant.stream.delta',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Hello back')],
        revision: 2,
        now: 240,
      }
    );

    expect(selectRenderableMessages(streaming)).toHaveLength(2);
    expect(selectRenderableMessages(streaming)[1]).toMatchObject({
      id: 'assistant:turn_client_1',
      role: 'assistant',
      status: 'streaming',
      parts: [textPart('Hello back')],
    });
  });

  it('merges a refetch during streaming without removing streamed content', () => {
    const streaming = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'assistant.stream.delta',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        requestId: 'req_1',
        parts: [textPart('Fresh streamed text')],
        revision: 1,
        now: 300,
      }
    );

    const refetched = reduceChatTimeline(streaming, {
      type: 'conversation.refetch.succeeded',
      conversationId: 'conv_1',
      requestId: 'refetch_old',
      receivedAt: 250,
      messages: [
        {
          id: 'msg_user_server',
          role: 'user',
          parts: [textPart('Hello')],
          createdAt: new Date(100),
          clientMessageId: 'turn_client_1:user',
          turnId: 'turn_server',
        },
      ],
    });

    expect(selectRenderableMessages(refetched)).toMatchObject([
      { id: 'user:turn_client_1', status: 'sent' },
      {
        id: 'assistant:turn_client_1',
        status: 'streaming',
        parts: [textPart('Fresh streamed text')],
      },
    ]);
  });

  it('ignores a late stale refetch after completion', () => {
    const completed = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'assistant.stream.completed',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Newest complete answer')],
        now: 500,
      }
    );

    const stale = reduceChatTimeline(completed, {
      type: 'conversation.refetch.succeeded',
      conversationId: 'conv_1',
      requestId: 'refetch_stale',
      receivedAt: 400,
      messages: [
        {
          id: 'msg_assistant_server',
          role: 'assistant',
          parts: [textPart('Older persisted answer')],
          createdAt: new Date(350),
          turnId: 'turn_server',
        },
      ],
    });

    expect(selectRenderableMessages(stale)[1]).toMatchObject({
      status: 'complete',
      parts: [textPart('Newest complete answer')],
    });
  });

  it('does not erase streamed content when completion has no parts', () => {
    const streaming = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'assistant.stream.delta',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Fresh streamed answer')],
        revision: 1,
        now: 200,
      }
    );

    const completed = reduceChatTimeline(streaming, {
      type: 'assistant.stream.completed',
      conversationId: 'conv_1',
      clientTurnId: 'turn_client_1',
      turnId: 'turn_server',
      requestId: 'req_1',
      parts: [],
      now: 300,
    });

    expect(selectRenderableMessages(completed)[1]).toMatchObject({
      status: 'complete',
      parts: [textPart('Fresh streamed answer')],
    });
  });

  it('ignores stream deltas that arrive after completion', () => {
    const completed = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'assistant.stream.completed',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Settled answer')],
        now: 300,
      }
    );

    const lateDelta = reduceChatTimeline(completed, {
      type: 'assistant.stream.delta',
      conversationId: 'conv_1',
      clientTurnId: 'turn_client_1',
      turnId: 'turn_server',
      requestId: 'req_1',
      parts: [textPart('Late stale delta')],
      revision: 99,
      now: 20_000,
    });

    expect(selectRenderableMessages(lateDelta)[1]).toMatchObject({
      status: 'complete',
      parts: [textPart('Settled answer')],
    });
  });

  it('ignores stale cache data that arrives after local completion', () => {
    const completed = reduceChatTimeline(
      reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      }),
      {
        type: 'assistant.stream.completed',
        conversationId: 'conv_1',
        clientTurnId: 'turn_client_1',
        turnId: 'turn_server',
        requestId: 'req_1',
        parts: [textPart('Newest complete answer')],
        now: 500,
      }
    );

    const stale = reduceChatTimeline(completed, {
      type: 'conversation.refetch.succeeded',
      conversationId: 'conv_1',
      requestId: 'refetch_20s_late',
      receivedAt: 20_500,
      messages: [
        {
          id: 'msg_assistant_server',
          role: 'assistant',
          parts: [textPart('Older persisted answer')],
          createdAt: new Date(350),
          turnId: 'turn_server',
        },
      ],
    });

    expect(selectRenderableMessages(stale)[1]).toMatchObject({
      status: 'complete',
      parts: [textPart('Newest complete answer')],
    });
  });

  it('keeps failed user messages visible and recoverable', () => {
    const sending = reduceChatTimeline(createInitialChatTimelineState(), {
      type: 'message.send.started',
      conversationId: null,
      clientTurnId: 'turn_client_1',
      clientMessageId: 'turn_client_1:user',
      requestId: 'req_1',
      parts: [textPart('Please answer')],
      now: 100,
    });

    const failed = reduceChatTimeline(sending, {
      type: 'assistant.stream.failed',
      conversationId: null,
      clientTurnId: 'turn_client_1',
      requestId: 'req_1',
      error: 'Server failed',
      now: 200,
    });

    expect(selectRenderableMessages(failed)).toMatchObject([
      {
        id: 'user:turn_client_1',
        role: 'user',
        status: 'failed',
      },
      {
        id: 'assistant:turn_client_1',
        role: 'assistant',
        status: 'failed',
      },
    ]);
    expect(selectRenderableMessages(failed)[0]?.parts).toEqual([
      textPart('Please answer'),
    ]);
  });
});
