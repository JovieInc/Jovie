import type { MessagePart } from '../types';

export type ChatTimelineMessageRole = 'user' | 'assistant';

export type ChatTimelineMessageStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'streaming'
  | 'complete'
  | 'failed';

export interface ChatTimelineMessage {
  readonly id: string;
  readonly role: ChatTimelineMessageRole;
  readonly parts: MessagePart[];
  readonly createdAt: Date;
  readonly status: ChatTimelineMessageStatus;
  readonly clientTurnId?: string;
  readonly clientMessageId?: string;
  readonly turnId?: string;
  readonly requestId?: string;
  readonly serverMessageId?: string;
  readonly failedReason?: string;
  readonly updatedAt: number;
  readonly completedAt?: number;
  readonly streamRevision: number;
  readonly source: 'local' | 'server' | 'command';
}

export interface ChatTimelineServerMessage {
  readonly id: string;
  readonly role: ChatTimelineMessageRole;
  readonly parts: MessagePart[];
  readonly createdAt: Date;
  readonly clientMessageId?: string | null;
  readonly turnId?: string | null;
  readonly requestId?: string | null;
}

export interface ChatTimelineDiagnostic {
  readonly type:
    | 'stale-event-ignored'
    | 'refetch-merged'
    | 'destructive-refetch-prevented'
    | 'duplicate-streaming-assistant';
  readonly event: ChatTimelineEvent['type'];
  readonly conversationId: string | null;
  readonly messageId?: string;
  readonly reason?: string;
}

export interface ChatTimelineState {
  readonly conversationId: string | null;
  readonly phase: 'idle' | 'initial-loading' | 'ready' | 'error';
  readonly messages: readonly ChatTimelineMessage[];
  readonly activeClientTurnId: string | null;
  readonly requestEpoch: number;
  readonly lastEventAt: number;
  readonly diagnostics: readonly ChatTimelineDiagnostic[];
}

type BaseEvent = {
  readonly conversationId?: string | null;
  readonly requestId?: string | null;
  readonly now?: number;
};

export type ChatTimelineEvent =
  | (BaseEvent & {
      readonly type: 'conversation.switched';
      readonly conversationId: string | null;
    })
  | (BaseEvent & {
      readonly type: 'conversation.load.started';
      readonly conversationId: string | null;
    })
  | (BaseEvent & {
      readonly type: 'conversation.load.succeeded';
      readonly conversationId: string | null;
      readonly messages: readonly ChatTimelineServerMessage[];
      readonly receivedAt?: number;
    })
  | (BaseEvent & {
      readonly type: 'conversation.load.failed';
      readonly error: string;
    })
  | (BaseEvent & {
      readonly type: 'conversation.refetch.succeeded';
      readonly conversationId: string;
      readonly messages: readonly ChatTimelineServerMessage[];
      readonly receivedAt?: number;
    })
  | (BaseEvent & {
      readonly type: 'conversation.refetch.failed';
      readonly error: string;
    })
  | (BaseEvent & {
      readonly type: 'message.send.started';
      readonly clientTurnId: string;
      readonly clientMessageId: string;
      readonly parts: MessagePart[];
    })
  | (BaseEvent & {
      readonly type: 'message.retry.started';
      readonly clientTurnId: string;
    })
  | (BaseEvent & {
      readonly type: 'message.send.acknowledged';
      readonly clientTurnId: string;
      readonly conversationId: string;
      readonly turnId?: string | null;
      readonly serverUserMessageId?: string | null;
    })
  | (BaseEvent & {
      readonly type: 'assistant.stream.started';
      readonly clientTurnId: string;
      readonly turnId?: string | null;
    })
  | (BaseEvent & {
      readonly type: 'assistant.stream.delta';
      readonly clientTurnId: string;
      readonly turnId?: string | null;
      readonly parts: MessagePart[];
      readonly revision?: number;
    })
  | (BaseEvent & {
      readonly type: 'assistant.stream.completed';
      readonly clientTurnId: string;
      readonly turnId?: string | null;
      readonly parts?: MessagePart[];
    })
  | (BaseEvent & {
      readonly type: 'assistant.stream.failed';
      readonly clientTurnId: string;
      readonly error: string;
    })
  | (BaseEvent & {
      readonly type: 'deterministic.command.completed';
      readonly clientTurnId: string;
      readonly userParts: MessagePart[];
      readonly assistantParts: MessagePart[];
    });

const MAX_DIAGNOSTICS = 50;

export function createInitialChatTimelineState(
  conversationId: string | null = null
): ChatTimelineState {
  return {
    conversationId,
    phase: conversationId ? 'initial-loading' : 'ready',
    messages: [],
    activeClientTurnId: null,
    requestEpoch: 0,
    lastEventAt: 0,
    diagnostics: [],
  };
}

export function selectRenderableMessages(
  state: ChatTimelineState
): readonly ChatTimelineMessage[] {
  return state.messages;
}

export function reduceChatTimeline(
  state: ChatTimelineState,
  event: ChatTimelineEvent
): ChatTimelineState {
  const now = event.now ?? Date.now();

  switch (event.type) {
    case 'conversation.switched':
      return {
        ...createInitialChatTimelineState(event.conversationId),
        requestEpoch: state.requestEpoch + 1,
        lastEventAt: now,
      };
    case 'conversation.load.started':
      return {
        ...state,
        conversationId: event.conversationId,
        phase: state.messages.length === 0 ? 'initial-loading' : 'ready',
        requestEpoch: state.requestEpoch + 1,
        lastEventAt: now,
      };
    case 'conversation.load.succeeded':
    case 'conversation.refetch.succeeded':
      return mergeServerMessages(state, event.messages, {
        type: event.type,
        conversationId: event.conversationId,
        receivedAt: event.receivedAt ?? now,
        phase: 'ready',
      });
    case 'conversation.load.failed':
      return {
        ...state,
        phase: state.messages.length > 0 ? 'ready' : 'error',
        lastEventAt: now,
      };
    case 'conversation.refetch.failed':
      return { ...state, lastEventAt: now };
    case 'message.send.started':
      return appendSendStarted(state, event, now);
    case 'message.retry.started':
      return markRetryStarted(state, event.clientTurnId, now);
    case 'message.send.acknowledged':
      return acknowledgeSend(state, event, now);
    case 'assistant.stream.started':
      return updateAssistantMessage(
        state,
        event.clientTurnId,
        now,
        event,
        message => ({
          ...message,
          status: canAdvanceToStreaming(message.status)
            ? 'streaming'
            : message.status,
          turnId: event.turnId ?? message.turnId,
          requestId: event.requestId ?? message.requestId,
          updatedAt: now,
        })
      );
    case 'assistant.stream.delta':
      return applyStreamDelta(state, event, now);
    case 'assistant.stream.completed':
      return completeStream(state, event, now);
    case 'assistant.stream.failed':
      return failTurn(state, event, now);
    case 'deterministic.command.completed':
      return appendDeterministicCommand(state, event, now);
    default:
      return state;
  }
}

function appendSendStarted(
  state: ChatTimelineState,
  event: Extract<ChatTimelineEvent, { type: 'message.send.started' }>,
  now: number
): ChatTimelineState {
  const userId = userRenderKey(event.clientTurnId);
  const assistantId = assistantRenderKey(event.clientTurnId);
  const withoutDuplicate = state.messages.filter(
    message =>
      message.id !== userId &&
      message.id !== assistantId &&
      message.clientTurnId !== event.clientTurnId
  );

  return {
    ...state,
    conversationId: event.conversationId ?? state.conversationId,
    phase: 'ready',
    activeClientTurnId: event.clientTurnId,
    lastEventAt: now,
    messages: [
      ...withoutDuplicate,
      {
        id: userId,
        role: 'user',
        parts: event.parts,
        createdAt: new Date(now),
        status: 'sending',
        clientTurnId: event.clientTurnId,
        clientMessageId: event.clientMessageId,
        requestId: event.requestId ?? undefined,
        updatedAt: now,
        streamRevision: 0,
        source: 'local',
      },
      {
        id: assistantId,
        role: 'assistant',
        parts: [],
        createdAt: new Date(now + 1),
        status: 'pending',
        clientTurnId: event.clientTurnId,
        requestId: event.requestId ?? undefined,
        updatedAt: now,
        streamRevision: 0,
        source: 'local',
      },
    ],
  };
}

function appendDeterministicCommand(
  state: ChatTimelineState,
  event: Extract<
    ChatTimelineEvent,
    { type: 'deterministic.command.completed' }
  >,
  now: number
): ChatTimelineState {
  return {
    ...state,
    phase: 'ready',
    lastEventAt: now,
    messages: [
      ...state.messages,
      {
        id: userRenderKey(event.clientTurnId),
        role: 'user',
        parts: event.userParts,
        createdAt: new Date(now),
        status: 'complete',
        clientTurnId: event.clientTurnId,
        updatedAt: now,
        completedAt: now,
        streamRevision: 0,
        source: 'command',
      },
      {
        id: assistantRenderKey(event.clientTurnId),
        role: 'assistant',
        parts: event.assistantParts,
        createdAt: new Date(now + 1),
        status: 'complete',
        clientTurnId: event.clientTurnId,
        updatedAt: now,
        completedAt: now,
        streamRevision: 0,
        source: 'command',
      },
    ],
  };
}

function markRetryStarted(
  state: ChatTimelineState,
  clientTurnId: string,
  now: number
): ChatTimelineState {
  return {
    ...state,
    activeClientTurnId: clientTurnId,
    lastEventAt: now,
    messages: state.messages.map(message =>
      message.clientTurnId === clientTurnId
        ? {
            ...message,
            status: message.role === 'user' ? 'sending' : 'pending',
            failedReason: undefined,
            updatedAt: now,
          }
        : message
    ),
  };
}

function acknowledgeSend(
  state: ChatTimelineState,
  event: Extract<ChatTimelineEvent, { type: 'message.send.acknowledged' }>,
  now: number
): ChatTimelineState {
  return {
    ...state,
    conversationId: event.conversationId,
    phase: 'ready',
    lastEventAt: now,
    messages: state.messages.map(message => {
      if (message.clientTurnId !== event.clientTurnId) return message;

      if (message.role === 'user') {
        return {
          ...message,
          status: message.status === 'failed' ? 'failed' : 'sent',
          turnId: event.turnId ?? message.turnId,
          requestId: event.requestId ?? message.requestId,
          serverMessageId: event.serverUserMessageId ?? message.serverMessageId,
          updatedAt: now,
        };
      }

      return {
        ...message,
        turnId: event.turnId ?? message.turnId,
        requestId: event.requestId ?? message.requestId,
        updatedAt: now,
      };
    }),
  };
}

function applyStreamDelta(
  state: ChatTimelineState,
  event: Extract<ChatTimelineEvent, { type: 'assistant.stream.delta' }>,
  now: number
): ChatTimelineState {
  return updateAssistantMessage(
    state,
    event.clientTurnId,
    now,
    event,
    message => {
      if (message.status === 'complete' || message.status === 'failed') {
        return message;
      }

      const revision = event.revision ?? message.streamRevision + 1;
      if (revision < message.streamRevision) {
        return message;
      }

      return {
        ...message,
        status: 'streaming',
        parts: event.parts,
        turnId: event.turnId ?? message.turnId,
        requestId: event.requestId ?? message.requestId,
        updatedAt: now,
        streamRevision: revision,
      };
    }
  );
}

function completeStream(
  state: ChatTimelineState,
  event: Extract<ChatTimelineEvent, { type: 'assistant.stream.completed' }>,
  now: number
): ChatTimelineState {
  return updateAssistantMessage(
    state,
    event.clientTurnId,
    now,
    event,
    message => {
      if (message.status === 'complete' || message.status === 'failed') {
        return message;
      }

      const completedParts =
        event.parts && event.parts.length > 0 ? event.parts : message.parts;

      return {
        ...message,
        status: 'complete',
        parts: completedParts,
        turnId: event.turnId ?? message.turnId,
        requestId: event.requestId ?? message.requestId,
        updatedAt: now,
        completedAt: now,
        streamRevision: message.streamRevision + 1,
      };
    },
    { activeClientTurnId: null }
  );
}

function failTurn(
  state: ChatTimelineState,
  event: Extract<ChatTimelineEvent, { type: 'assistant.stream.failed' }>,
  now: number
): ChatTimelineState {
  return {
    ...state,
    activeClientTurnId:
      state.activeClientTurnId === event.clientTurnId
        ? null
        : state.activeClientTurnId,
    lastEventAt: now,
    messages: state.messages.map(message =>
      message.clientTurnId === event.clientTurnId
        ? {
            ...message,
            status: 'failed',
            parts:
              message.role === 'assistant' && message.parts.length === 0
                ? failureParts(event.error)
                : message.parts,
            failedReason: event.error,
            requestId: event.requestId ?? message.requestId,
            updatedAt: now,
          }
        : message
    ),
  };
}

function failureParts(error: string): MessagePart[] {
  return [
    {
      type: 'text',
      text: error || 'Jovie could not complete that response. Please retry.',
    } as MessagePart,
  ];
}

function updateAssistantMessage(
  state: ChatTimelineState,
  clientTurnId: string,
  now: number,
  event: ChatTimelineEvent,
  updater: (message: ChatTimelineMessage) => ChatTimelineMessage,
  patch?: Partial<ChatTimelineState>
): ChatTimelineState {
  let didUpdate = false;
  const messages = state.messages.map(message => {
    if (message.role !== 'assistant' || message.clientTurnId !== clientTurnId) {
      return message;
    }
    didUpdate = true;
    return updater(message);
  });

  if (!didUpdate) {
    return {
      ...state,
      diagnostics: appendDiagnostic(state, {
        type: 'stale-event-ignored',
        event: event.type,
        conversationId: event.conversationId ?? state.conversationId,
        reason: 'assistant row missing for client turn',
      }),
      lastEventAt: now,
    };
  }

  return {
    ...state,
    ...patch,
    messages,
    lastEventAt: now,
  };
}

function mergeServerMessages(
  state: ChatTimelineState,
  serverMessages: readonly ChatTimelineServerMessage[],
  options: {
    readonly type:
      | 'conversation.load.succeeded'
      | 'conversation.refetch.succeeded';
    readonly conversationId: string | null;
    readonly receivedAt: number;
    readonly phase: ChatTimelineState['phase'];
  }
): ChatTimelineState {
  const messages = [...state.messages];
  let preventedRemoval = false;

  for (const serverMessage of serverMessages) {
    const index = findServerMessageMatch(messages, serverMessage);
    const normalized = normalizeServerMessage(
      serverMessage,
      options.receivedAt
    );

    if (index === -1) {
      messages.push(normalized);
      continue;
    }

    const existing = messages[index];
    if (shouldKeepLocalContent(existing, serverMessage, options.receivedAt)) {
      messages[index] = mergeServerMetadata(existing, serverMessage, {
        status: serverMessage.role === 'user' ? 'sent' : existing.status,
        receivedAt: options.receivedAt,
      });
      continue;
    }

    messages[index] = mergeServerContent(
      existing,
      normalized,
      options.receivedAt
    );
  }

  for (const message of state.messages) {
    if (!messages.some(candidate => candidate.id === message.id)) {
      preventedRemoval = true;
      messages.push(message);
    }
  }

  const sortedMessages = sortTimeline(messages);

  return {
    ...state,
    conversationId: options.conversationId ?? state.conversationId,
    phase: options.phase,
    messages: sortedMessages,
    lastEventAt: options.receivedAt,
    diagnostics: appendDiagnostic(
      {
        ...state,
        diagnostics: preventedRemoval
          ? appendDiagnostic(state, {
              type: 'destructive-refetch-prevented',
              event: options.type,
              conversationId: options.conversationId,
              reason: 'server payload omitted local timeline messages',
            })
          : state.diagnostics,
      },
      {
        type: 'refetch-merged',
        event: options.type,
        conversationId: options.conversationId,
      }
    ),
  };
}

function normalizeServerMessage(
  message: ChatTimelineServerMessage,
  receivedAt: number
): ChatTimelineMessage {
  return {
    id: serverRenderKey(message),
    role: message.role,
    parts: message.parts,
    createdAt: message.createdAt,
    status: 'complete',
    clientTurnId: inferClientTurnId(message),
    clientMessageId: message.clientMessageId ?? undefined,
    turnId: message.turnId ?? undefined,
    requestId: message.requestId ?? undefined,
    serverMessageId: message.id,
    updatedAt: receivedAt,
    completedAt: receivedAt,
    streamRevision: 0,
    source: 'server',
  };
}

function mergeServerMetadata(
  existing: ChatTimelineMessage,
  serverMessage: ChatTimelineServerMessage,
  options: {
    readonly status?: ChatTimelineMessageStatus;
    readonly receivedAt: number;
  }
): ChatTimelineMessage {
  return {
    ...existing,
    status: options.status ?? existing.status,
    clientMessageId: serverMessage.clientMessageId ?? existing.clientMessageId,
    turnId: serverMessage.turnId ?? existing.turnId,
    requestId: serverMessage.requestId ?? existing.requestId,
    serverMessageId: serverMessage.id,
    updatedAt: Math.max(existing.updatedAt, options.receivedAt),
  };
}

function mergeServerContent(
  existing: ChatTimelineMessage,
  serverMessage: ChatTimelineMessage,
  receivedAt: number
): ChatTimelineMessage {
  return {
    ...existing,
    parts: serverMessage.parts,
    status: 'complete',
    clientMessageId: serverMessage.clientMessageId ?? existing.clientMessageId,
    turnId: serverMessage.turnId ?? existing.turnId,
    requestId: serverMessage.requestId ?? existing.requestId,
    serverMessageId: serverMessage.serverMessageId ?? existing.serverMessageId,
    updatedAt: Math.max(existing.updatedAt, receivedAt),
    completedAt: existing.completedAt ?? receivedAt,
  };
}

function shouldKeepLocalContent(
  existing: ChatTimelineMessage,
  serverMessage: ChatTimelineServerMessage,
  receivedAt: number
): boolean {
  if (existing.status === 'sending' || existing.status === 'pending') {
    return true;
  }
  if (existing.status === 'streaming') {
    return true;
  }
  if (existing.status === 'failed') {
    return true;
  }
  if (
    existing.status === 'complete' &&
    existing.source === 'local' &&
    existing.completedAt
  ) {
    return (
      receivedAt < existing.completedAt ||
      serverMessage.createdAt.getTime() < existing.completedAt
    );
  }
  return false;
}

function findServerMessageMatch(
  messages: readonly ChatTimelineMessage[],
  serverMessage: ChatTimelineServerMessage
): number {
  const clientTurnId = inferClientTurnId(serverMessage);
  return messages.findIndex(message => {
    if (
      message.serverMessageId &&
      message.serverMessageId === serverMessage.id
    ) {
      return true;
    }
    if (
      serverMessage.turnId &&
      message.turnId === serverMessage.turnId &&
      message.role === serverMessage.role
    ) {
      return true;
    }
    if (
      serverMessage.clientMessageId &&
      message.clientMessageId === serverMessage.clientMessageId
    ) {
      return true;
    }
    if (
      clientTurnId &&
      message.clientTurnId === clientTurnId &&
      message.role === serverMessage.role
    ) {
      return true;
    }
    return false;
  });
}

function sortTimeline(
  messages: readonly ChatTimelineMessage[]
): readonly ChatTimelineMessage[] {
  return [...messages].sort((left, right) => {
    const byTime = left.createdAt.getTime() - right.createdAt.getTime();
    if (byTime !== 0) return byTime;
    if (left.role === right.role) return left.id.localeCompare(right.id);
    return left.role === 'user' ? -1 : 1;
  });
}

function canAdvanceToStreaming(status: ChatTimelineMessageStatus): boolean {
  return status === 'pending' || status === 'sent' || status === 'streaming';
}

function inferClientTurnId(
  message: Pick<ChatTimelineServerMessage, 'clientMessageId' | 'role'>
): string | undefined {
  const clientMessageId = message.clientMessageId ?? undefined;
  if (!clientMessageId) return undefined;
  if (clientMessageId.endsWith(':user')) {
    return clientMessageId.slice(0, -':user'.length);
  }
  if (clientMessageId.startsWith('assistant:')) {
    return clientMessageId.slice('assistant:'.length);
  }
  return undefined;
}

function serverRenderKey(message: ChatTimelineServerMessage): string {
  const clientTurnId = inferClientTurnId(message);
  if (clientTurnId) {
    return message.role === 'user'
      ? userRenderKey(clientTurnId)
      : assistantRenderKey(clientTurnId);
  }
  if (message.turnId) {
    return `${message.role}:${message.turnId}`;
  }
  return `${message.role}:server:${message.id}`;
}

function userRenderKey(clientTurnId: string): string {
  return `user:${clientTurnId}`;
}

function assistantRenderKey(clientTurnId: string): string {
  return `assistant:${clientTurnId}`;
}

function appendDiagnostic(
  state: Pick<ChatTimelineState, 'diagnostics'>,
  diagnostic: ChatTimelineDiagnostic
): readonly ChatTimelineDiagnostic[] {
  return [...state.diagnostics, diagnostic].slice(-MAX_DIAGNOSTICS);
}
