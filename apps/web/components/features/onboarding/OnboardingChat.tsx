'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatInput,
  ChatMessage,
  ErrorDisplay,
} from '@/components/jovie/components';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import type { ChatError, MessagePart } from '@/components/jovie/types';
import {
  extractErrorMetadata,
  getErrorType,
  getPreferredErrorMessage,
} from '@/components/jovie/utils';
import { cn } from '@/lib/utils';
import {
  ChatProposeCheckoutCard,
  type CheckoutCardPayload,
} from './ChatProposeCheckoutCard';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';

/**
 * Anonymous onboarding chat client (JOV-2132 PR 3).
 *
 * Streams against `/api/chat` in `mode='onboarding'`. The first request also
 * carries the Cloudflare Turnstile token; subsequent requests in the same
 * session do not (the signed cookie + session-lifetime rate limit carry
 * trust forward).
 */

interface OnboardingChatProps {
  /** Turnstile token from the widget. Required on first message. */
  readonly turnstileToken: string | null;
  /** Fires after a submitted user turn reaches the ready state. */
  readonly onConversationActivity?: () => void;
}

/** Pull the user-visible text out of a UIMessage's parts. */
const THINKING_PLACEHOLDER_ID = 'onboarding-thinking-placeholder';

function getMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

type ToolPart = MessagePart & {
  readonly type: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly output?: unknown;
  readonly state?: string;
};

function isToolPart(part: unknown): part is ToolPart {
  if (!part || typeof part !== 'object') return false;
  const type = (part as { type?: unknown }).type;
  return (
    type === 'dynamic-tool' ||
    (typeof type === 'string' && type.startsWith('tool-'))
  );
}

function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  // Convention: AI SDK emits parts of type `tool-<name>` when output is present.
  return part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : part.type;
}

/**
 * Extract tool parts from a message. Returns the structured parts (not text)
 * so the renderer can decide between rich cards (proposeNextStep,
 * proposeCheckout) and the chip fallback for the rest.
 */
function getToolParts(message: UIMessage): readonly ToolPart[] {
  return ((message.parts ?? []) as readonly MessagePart[]).filter(isToolPart);
}

interface ToolOutputWithAction {
  readonly action?: string;
}

function isNextStepPayload(output: unknown): output is NextStepCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_next_step'
  );
}

function isCheckoutPayload(output: unknown): output is CheckoutCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_checkout'
  );
}

function findLastAssistantMessageId(messages: readonly UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.role === 'assistant' &&
      message.id !== THINKING_PLACEHOLDER_ID
    ) {
      return message.id;
    }
  }
  return null;
}

function renderOnboardingTools({
  messageId,
  toolParts,
  hasMessageText,
}: {
  readonly messageId: string;
  readonly toolParts: readonly ToolPart[];
  readonly hasMessageText: boolean;
}) {
  const genericParts: ToolPart[] = [];
  const cards = toolParts.map((part, i) => {
    const toolName = getToolName(part);
    const key = part.toolCallId ?? `${messageId}-tool-${i}`;
    const output = part.output;

    if (toolName === 'proposeNextStep' && isNextStepPayload(output)) {
      return (
        <div key={key} className='w-full max-w-[440px]'>
          <ChatProposeNextStepCard payload={output} />
        </div>
      );
    }

    if (toolName === 'proposeCheckout' && isCheckoutPayload(output)) {
      return (
        <div key={key} className='w-full max-w-[440px]'>
          <ChatProposeCheckoutCard payload={output} />
        </div>
      );
    }

    genericParts.push(part);
    return null;
  });

  if (toolParts.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3 pl-9', hasMessageText && 'mt-3')}>
      {cards}
      {genericParts.length > 0 ? (
        <ToolPartsRenderer
          parts={genericParts}
          variant='chat'
          hasMessageText={false}
        />
      ) : null}
    </div>
  );
}

export function OnboardingChat({
  onConversationActivity,
  turnstileToken,
}: OnboardingChatProps) {
  const [input, setInput] = useState('');
  const [hasSentFirst, setHasSentFirst] = useState(false);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const completedUserTurnsRef = useRef(0);
  const lastAttemptedMessageRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        // `prepareSendMessagesRequest` lets us mutate the body per-request so
        // the first POST carries the Turnstile token; subsequent POSTs skip it.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            mode: 'onboarding' as const,
            messages,
            ...(turnstileToken ? { turnstileToken } : {}),
          },
        }),
      }),
    [turnstileToken]
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: 'onboarding',
    transport,
    onError: error => {
      const type = getErrorType(error);
      const metadata = extractErrorMetadata(error);
      setChatError({
        type,
        message: getPreferredErrorMessage(error, type, metadata),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId: metadata.requestId,
        failedMessage: lastAttemptedMessageRef.current ?? undefined,
      });
      if (lastAttemptedMessageRef.current) {
        setInput(lastAttemptedMessageRef.current);
      }
    },
  });

  const isSubmitted = status === 'submitted';
  const isStreaming = status === 'streaming';
  const isBusy = isSubmitted || isStreaming;
  const requiresTurnstile = process.env.NODE_ENV !== 'development';
  const isAwaitingFirstToken =
    requiresTurnstile && !hasSentFirst && !turnstileToken;
  const lastMessage = messages[messages.length - 1];
  const shouldShowThinking = isBusy && lastMessage?.role === 'user';
  const displayMessages: readonly UIMessage[] = shouldShowThinking
    ? [
        ...messages,
        {
          id: THINKING_PLACEHOLDER_ID,
          role: 'assistant',
          parts: [],
        },
      ]
    : messages;
  const lastAssistantMessageId = findLastAssistantMessageId(displayMessages);

  const submitText = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || isBusy) return;
      if (isAwaitingFirstToken) {
        // Turnstile hasn't issued a token yet; the widget normally resolves
        // within ~500ms. Silently no-op so the user can retry.
        return;
      }
      lastAttemptedMessageRef.current = text;
      setChatError(null);
      sendMessage({ text });
      setHasSentFirst(true);
      setInput('');
    },
    [isAwaitingFirstToken, isBusy, sendMessage]
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      submitText(input);
    },
    [input, submitText]
  );

  const handleRetry = useCallback(() => {
    const failedMessage = chatError?.failedMessage;
    if (!failedMessage) return;
    submitText(failedMessage);
  }, [chatError?.failedMessage, submitText]);

  // Auto-scroll on new content
  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayMessages.length, isBusy]);

  useEffect(() => {
    if (status !== 'ready') return;
    const completedUserTurns = messages.filter(
      message => message.role === 'user'
    ).length;
    if (completedUserTurns <= completedUserTurnsRef.current) return;
    completedUserTurnsRef.current = completedUserTurns;
    onConversationActivity?.();
  }, [messages, onConversationActivity, status]);

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div
        ref={messagesRef}
        className='relative flex-1 overflow-y-auto px-4 py-5 sm:px-5'
        aria-live='polite'
      >
        <div className='mx-auto flex min-h-full w-full max-w-[44rem] flex-col'>
          {messages.length === 0 ? (
            <div className='flex flex-1 items-center justify-center py-12'>
              <h1 className='text-balance text-center text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] text-primary-token sm:text-[3rem]'>
                What are you working on?
              </h1>
            </div>
          ) : (
            <div className='flex flex-col pb-4'>
              {displayMessages.map(message => {
                const text = getMessageText(message);
                const toolParts = getToolParts(message);
                const isThinking = message.id === THINKING_PLACEHOLDER_ID;
                const shouldRenderMessage =
                  isThinking || Boolean(text) || toolParts.length === 0;

                return (
                  <div key={message.id} className='pb-5'>
                    {shouldRenderMessage ? (
                      <ChatMessage
                        id={message.id}
                        role={message.role}
                        parts={(message.parts ?? []) as MessagePart[]}
                        isThinking={isThinking}
                        isStreaming={
                          isStreaming && message.id === lastAssistantMessageId
                        }
                        renderTools={false}
                      />
                    ) : null}
                    {!isThinking
                      ? renderOnboardingTools({
                          messageId: message.id,
                          toolParts,
                          hasMessageText: Boolean(text),
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className='shrink-0 bg-surface-1 px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
        <div className='mx-auto w-full max-w-[34rem]'>
          {chatError ? (
            <div className='mb-2'>
              <ErrorDisplay
                chatError={chatError}
                onRetry={handleRetry}
                isLoading={isBusy}
                isSubmitting={isSubmitted}
              />
            </div>
          ) : null}

          {isAwaitingFirstToken ? (
            <p
              className='mb-1.5 text-center text-xs text-tertiary-token'
              role='status'
              aria-live='polite'
            >
              Securing chat...
            </p>
          ) : null}

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isBusy}
            isSubmitting={isSubmitted || isAwaitingFirstToken}
            isStreaming={isStreaming}
            onStop={stop}
            placeholder={
              isAwaitingFirstToken ? 'Securing chat...' : 'Ask Jovie...'
            }
            shellChatV1
          />
        </div>
      </div>
    </div>
  );
}
