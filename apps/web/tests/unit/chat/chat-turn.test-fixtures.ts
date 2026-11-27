export interface FinishedChatTurn {
  message: {
    metadata?: unknown;
    parts?: Array<Record<string, unknown>>;
  };
  messages: unknown[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

export function conversationRouteProps(conversationId: string | undefined): {
  conversationId: string | undefined;
} {
  return { conversationId };
}

export function completedChatTurn({
  conversationId = 'conv_server',
  turnId = 'turn_server',
  requestId = 'req_1',
} = {}): FinishedChatTurn {
  return {
    message: {
      metadata: { conversationId, turnId, requestId },
      parts: [{ type: 'text', text: 'Hello back' }],
    },
    messages: [],
    isAbort: false,
    isDisconnect: false,
    isError: false,
  };
}
