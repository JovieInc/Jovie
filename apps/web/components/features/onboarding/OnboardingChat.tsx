'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatInput,
  ChatMessage,
  ErrorDisplay,
} from '@/components/jovie/components';
import { useChatJankMonitor, useStickToBottom } from '@/components/jovie/hooks';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import type { ChatError, MessagePart } from '@/components/jovie/types';
import {
  extractErrorMetadata,
  getErrorType,
  getPreferredErrorMessage,
} from '@/components/jovie/utils';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';
import {
  ChatProposeCheckoutCard,
  type CheckoutCardPayload,
} from './ChatProposeCheckoutCard';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';
import {
  type ArtistConfirmedOutput,
  type ArtistPickerOutput,
  type HandleCheckOutput,
  OnboardingArtistConfirmedCard,
  type OnboardingArtistSelection,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
  type SocialLinkOutput,
  useArtistSelectionMessage,
} from './OnboardingToolArtifacts';

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
const THINKING_PLACEHOLDER_ID = 'thinking-placeholder';

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
  readonly input?: unknown;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isArtistPickerOutput(output: unknown): output is ArtistPickerOutput {
  return asRecord(output)?.action === 'open_artist_picker';
}

function isArtistConfirmedOutput(
  output: unknown
): output is ArtistConfirmedOutput {
  return asRecord(output)?.action === 'spotify_artist_confirmed';
}

function isHandleCheckOutput(output: unknown): output is HandleCheckOutput {
  return asRecord(output)?.action === 'check_handle';
}

function isSocialLinkOutput(output: unknown): output is SocialLinkOutput {
  return asRecord(output)?.action === 'propose_social_link';
}

function getInputQuery(part: ToolPart): string | null {
  const input = asRecord(part.input);
  return typeof input?.query === 'string' ? input.query : null;
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

function getOnboardingErrorMessage(message: string): string {
  if (/authentication service is initializing/i.test(message)) {
    return 'Jovie is still connecting. Try again in a moment.';
  }
  return message;
}

function renderOnboardingTools({
  messageId,
  toolParts,
  hasMessageText,
  isBusy,
  onSelectArtist,
}: {
  readonly messageId: string;
  readonly toolParts: readonly ToolPart[];
  readonly hasMessageText: boolean;
  readonly isBusy: boolean;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
}) {
  const genericParts: ToolPart[] = [];
  const cards: ReactNode[] = [];

  toolParts.forEach((part, i) => {
    const toolName = getToolName(part);
    const key = part.toolCallId ?? `${messageId}-tool-${i}`;
    const output = part.output;

    if (toolName === 'recordInterviewSignal') {
      return;
    }

    if (
      toolName === 'searchSpotifyArtist' &&
      (isArtistPickerOutput(output) || output === undefined)
    ) {
      cards.push(
        <OnboardingSpotifyArtistPickerCard
          key={key}
          state={part.state}
          output={isArtistPickerOutput(output) ? output : null}
          inputQuery={getInputQuery(part)}
          disabled={isBusy}
          onSelectArtist={onSelectArtist}
        />
      );
      return;
    }

    if (
      toolName === 'confirmSpotifyArtist' &&
      (isArtistConfirmedOutput(output) || output === undefined)
    ) {
      cards.push(
        <OnboardingArtistConfirmedCard
          key={key}
          state={part.state}
          output={isArtistConfirmedOutput(output) ? output : null}
        />
      );
      return;
    }

    if (
      toolName === 'checkHandle' &&
      (isHandleCheckOutput(output) || output === undefined)
    ) {
      cards.push(
        <OnboardingHandleCheckCard
          key={key}
          state={part.state}
          output={isHandleCheckOutput(output) ? output : null}
        />
      );
      return;
    }

    if (
      toolName === 'proposeSocialLink' &&
      (isSocialLinkOutput(output) || output === undefined)
    ) {
      cards.push(
        <OnboardingSocialLinkCard
          key={key}
          state={part.state}
          output={isSocialLinkOutput(output) ? output : null}
        />
      );
      return;
    }

    if (toolName === 'proposeNextStep' && isNextStepPayload(output)) {
      const card = (
        <div key={key} className='w-full max-w-[440px]'>
          <ChatProposeNextStepCard payload={output} />
        </div>
      );
      cards.push(card);
      return;
    }

    if (toolName === 'proposeCheckout' && isCheckoutPayload(output)) {
      cards.push(
        <div key={key} className='w-full max-w-[440px]'>
          <ChatProposeCheckoutCard payload={output} />
        </div>
      );
      return;
    }

    genericParts.push(part);
  });

  if (cards.length === 0 && genericParts.length === 0) {
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

function OnboardingMessageList({
  displayMessages,
  isStreaming,
  lastAssistantMessageId,
  isBusy,
  onSelectArtist,
}: {
  readonly displayMessages: readonly UIMessage[];
  readonly isStreaming: boolean;
  readonly lastAssistantMessageId: string | null;
  readonly isBusy: boolean;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
}) {
  return (
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
                  isBusy,
                  onSelectArtist,
                })
              : null}
          </div>
        );
      })}
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
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  const completedUserTurnsRef = useRef(0);
  const lastAttemptedMessageRef = useRef<string | null>(null);
  const formatArtistSelectionMessage = useArtistSelectionMessage();

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
      const message = getPreferredErrorMessage(error, type, metadata);
      setChatError({
        type,
        message: getOnboardingErrorMessage(message),
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
  const { isStuckToBottom, onScroll, totalSizeRef, scrollContainerRef } =
    useStickToBottom({ messageCount: displayMessages.length });
  const jankMonitorEnabled = useAppFlag('CHAT_JANK_MONITOR');
  const { onSend: notifyJankSend } = useChatJankMonitor({
    conversationId: 'onboarding',
    messages,
    status,
    isStuckToBottom,
    scrollContainerRef,
    enabled: jankMonitorEnabled,
  });

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
      notifyJankSend();
      sendMessage({ text });
      setHasSentFirst(true);
      setInput('');
    },
    [isAwaitingFirstToken, isBusy, notifyJankSend, sendMessage]
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

  const handleArtistSelect = useCallback(
    (artist: OnboardingArtistSelection) => {
      submitText(formatArtistSelectionMessage(artist));
    },
    [formatArtistSelectionMessage, submitText]
  );

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
    <section
      className='relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-(--linear-app-content-surface)'
      aria-label='Jovie onboarding chat'
      data-testid='onboarding-chat'
      data-picker-open={composerPickerOpen ? 'true' : undefined}
    >
      {chatError && !composerPickerOpen ? (
        <div className='pointer-events-none absolute right-3 top-3 z-30 w-[min(27rem,calc(100%-1.5rem))] sm:right-4 sm:top-4'>
          <div className='pointer-events-auto'>
            <ErrorDisplay
              chatError={chatError}
              onRetry={handleRetry}
              isLoading={isBusy}
              isSubmitting={isSubmitted}
            />
          </div>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className='relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8'
        aria-live='polite'
      >
        <div
          ref={totalSizeRef}
          className='mx-auto flex min-h-full w-full max-w-[44rem] flex-col'
        >
          {messages.length === 0 ? (
            <div className='flex flex-1 items-center justify-center py-12'>
              <h1
                className={cn(
                  'text-balance text-center text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] text-primary-token transition-opacity duration-fast sm:text-[3rem]',
                  composerPickerOpen && 'opacity-0'
                )}
                aria-hidden={composerPickerOpen}
              >
                What are you working on?
              </h1>
            </div>
          ) : (
            <OnboardingMessageList
              displayMessages={displayMessages}
              isStreaming={isStreaming}
              lastAssistantMessageId={lastAssistantMessageId}
              isBusy={isBusy}
              onSelectArtist={handleArtistSelect}
            />
          )}
        </div>
      </div>

      <div className='shrink-0 bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-6 sm:pb-5 sm:pt-2.5 lg:px-8'>
        <div className='mx-auto w-full max-w-[34rem]'>
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
            onPickerOpenChange={setComposerPickerOpen}
            shellChatV1
          />
        </div>
      </div>
    </section>
  );
}
