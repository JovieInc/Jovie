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
      // Never downgrade an already-settled (`complete`) row. A prior refetch can
      // promote the optimistic user row to `complete`; forcing it back to `sent`
      // here oscillates its status across subsequent refetches, churning the
      // memoized transcript and re-flashing it on send (JOV-3528).
      const nextStatus =
        serverMessage.role === 'user' && existing.status !== 'complete'
          ? 'sent'
          : existing.status;
      messages[index] = mergeServerMetadata(existing, serverMessage, {
        status: nextStatus,
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

  // Reuse the prior array reference when the merge changed nothing the renderer
  // reads. Without this, every refetch hands the transcript a fresh array, which
  // re-runs `messages.map` and the scroll/jank effects even though the content is
  // identical — a contributor to the on-send flash (JOV-3528).
  const sortedMessages = preserveTimelineIdentity(
    state.messages,
    sortTimeline(messages)
  );

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

/**
 * Returns the previous messages array when `next` is element-wise reference
 * identical (same order, same objects). Lets a no-op refetch leave the rendered
 * list untouched so React skips re-running `messages.map` and dependent effects.
 */
function preserveTimelineIdentity(
  previous: readonly ChatTimelineMessage[],
  next: readonly ChatTimelineMessage[]
): readonly ChatTimelineMessage[] {
  if (previous === next) return previous;
  if (previous.length !== next.length) return next;
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] !== next[index]) return next;
  }
  return previous;
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
  const merged: ChatTimelineMessage = {
    ...existing,
    status: options.status ?? existing.status,
    clientMessageId: serverMessage.clientMessageId ?? existing.clientMessageId,
    turnId: serverMessage.turnId ?? existing.turnId,
    requestId: serverMessage.requestId ?? existing.requestId,
    serverMessageId: serverMessage.id,
    updatedAt: Math.max(existing.updatedAt, options.receivedAt),
  };

  // Metadata-only merges (server acknowledging an optimistic row) must not
  // change the rendered identity. Preserve the original object when only
  // non-rendered bookkeeping fields would change (JOV-3528).
  return rowRenderEqual(existing, merged) ? existing : merged;
}

function mergeServerContent(
  existing: ChatTimelineMessage,
  serverMessage: ChatTimelineMessage,
  receivedAt: number
): ChatTimelineMessage {
  // Preserve the existing `parts` reference when the server payload is
  // content-identical. A refetch (title polling, post-stream invalidation)
  // otherwise hands every matched row a fresh `parts` array, which breaks the
  // memoized `ChatMessage` reference check and replays its entrance animation —
  // the whole transcript flashes blank then re-renders on each send
  // (JOV-3528, regression of the JOV-2559 merge contract).
  const nextParts = messagePartsEqual(existing.parts, serverMessage.parts)
    ? existing.parts
    : serverMessage.parts;

  const merged: ChatTimelineMessage = {
    ...existing,
    parts: nextParts,
    status: 'complete',
    clientMessageId: serverMessage.clientMessageId ?? existing.clientMessageId,
    turnId: serverMessage.turnId ?? existing.turnId,
    requestId: serverMessage.requestId ?? existing.requestId,
    serverMessageId: serverMessage.serverMessageId ?? existing.serverMessageId,
    updatedAt: Math.max(existing.updatedAt, receivedAt),
    completedAt: existing.completedAt ?? receivedAt,
  };

  // If nothing the renderer reads changed, return the original object so React
  // reconciliation treats the row as untouched (no remount, no entrance flash).
  return rowRenderEqual(existing, merged) ? existing : merged;
}

/**
 * Structural equality for the fields a rendered row depends on. Used to keep
 * message object identity stable across no-op server merges so the memoized
 * transcript does not re-render or replay entrance animations.
 */
function rowRenderEqual(
  left: ChatTimelineMessage,
  right: ChatTimelineMessage
): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.status === right.status &&
    left.parts === right.parts
  );
}

/**
 * Shallow-ish structural comparison of message parts. Avoids JSON.stringify on
 * a path that runs on every conversation refetch. Returns true when both arrays
 * describe the same renderable content.
 */
function messagePartsEqual(
  left: readonly MessagePart[],
  right: readonly MessagePart[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (!messagePartEqual(left[index], right[index])) return false;
  }
  return true;
}

function messagePartEqual(left: MessagePart, right: MessagePart): boolean {
  if (left === right) return true;
  if (left.type !== right.type) return false;

  const leftText =
    'text' in left && typeof left.text === 'string' ? left.text : undefined;
  const rightText =
    'text' in right && typeof right.text === 'string' ? right.text : undefined;
  if (leftText !== rightText) return false;

  const leftUrl =
    'url' in left && typeof left.url === 'string' ? left.url : undefined;
  const rightUrl =
    'url' in right && typeof right.url === 'string' ? right.url : undefined;
  if (leftUrl !== rightUrl) return false;

  // Tool/dynamic parts carry richer payloads; fall back to a structural compare
  // only for these (rare on the refetch path) so we never wrongly treat a
  // changed tool result as identical.
  const type = left.type;
  if (
    typeof type === 'string' &&
    (type.startsWith('tool-') || type === 'dynamic-tool')
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  return true;
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
