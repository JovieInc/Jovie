'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  consumeHomepageIntent,
  readHomepageIntent,
  sanitizeHomepagePrompt,
} from '@/components/homepage/intent-store';
import {
  ChatEmptyStateComposerRegion,
  ChatInput,
  ChatMessage,
} from '@/components/jovie/components';
import { useChatJankMonitor, useStickToBottom } from '@/components/jovie/hooks';
import {
  composeMessage,
  useChipTray,
} from '@/components/jovie/hooks/useChipTray';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import type { ChatError, MessagePart } from '@/components/jovie/types';
import {
  extractErrorMetadata,
  getErrorType,
  getPreferredErrorMessage,
} from '@/components/jovie/utils';
import { track } from '@/lib/analytics';
import { useAppFlag } from '@/lib/flags/client';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import { cn } from '@/lib/utils';
import {
  ChatProposeCheckoutCard,
  type CheckoutCardPayload,
} from './ChatProposeCheckoutCard';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';
import type {
  OnboardingProfileArtist,
  OnboardingProfileBuilderState,
} from './OnboardingProfileRail';
import { OnboardingProfileRail } from './OnboardingProfileRail';
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
import type { OnboardingTurnstileStatus } from './OnboardingTurnstile';

/**
 * Anonymous onboarding chat client (JOV-2132 PR 3).
 *
 * Streams against `/api/chat` in `mode='onboarding'`. The first request also
 * carries the Cloudflare Turnstile token; subsequent requests in the same
 * session do not (the signed cookie + session-lifetime rate limit carry
 * trust forward).
 */

interface OnboardingChatProps {
  /** ID for a homepage-captured starter prompt stored in localStorage. */
  readonly intentId?: string;
  /** Turnstile token from the widget. Required on first message. */
  readonly turnstileToken: string | null;
  /** Current Turnstile widget state for first-message gating. */
  readonly turnstileStatus?: OnboardingTurnstileStatus;
  /** Visible Turnstile challenge panel rendered near the composer. */
  readonly turnstilePanel?: ReactNode;
  /** Requests the visible Turnstile panel when a send needs verification. */
  readonly onTurnstileRequired?: (message?: string) => void;
  /** Clears stale verification after the server rejects a token. */
  readonly onTurnstileRejected?: () => void;
  /** Fires after a submitted user turn reaches the ready state. */
  readonly onConversationActivity?: () => void;
  /** Emits selected/matched profile state for the progressive builder rail. */
  readonly onProfileBuilderChange?: (
    state: OnboardingProfileBuilderState
  ) => void;
  /** URL-provided starter prompt for demo and deep-link flows. */
  readonly starterPrompt?: string;
}

/** Pull the user-visible text out of a UIMessage's parts. */
const THINKING_PLACEHOLDER_ID = 'thinking-placeholder';
const BLOCKED_TURNSTILE_TOKEN_STATUSES: ReadonlySet<
  OnboardingTurnstileStatus | undefined
> = new Set(['expired', 'timeout', 'error', 'unsupported', 'unconfigured']);

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

type OnboardingToolRendererArgs = {
  readonly part: ToolPart;
  readonly key: string;
  readonly isBusy: boolean;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly selectedArtistId: string | null;
};

type OnboardingToolRenderer = (
  args: OnboardingToolRendererArgs
) => ReactNode | null;

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

function artistFromSelection(
  artist: OnboardingArtistSelection | null
): OnboardingProfileArtist | null {
  if (!artist) return null;
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? null,
    followers: artist.followers ?? null,
    popularity: artist.popularity ?? null,
    genres: [],
    dspMatches: [
      {
        id: 'spotify',
        label: 'Spotify',
        platform: 'spotify',
        url: artist.url,
      },
    ],
  };
}

function artistFromConfirmedOutput(
  output: ArtistConfirmedOutput
): OnboardingProfileArtist | null {
  const artist = output.artist;
  if (!artist) return null;
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? null,
    followers: artist.followers ?? null,
    popularity: artist.popularity ?? null,
    genres: artist.genres ?? [],
    dspMatches: [
      {
        id: 'spotify',
        label: 'Spotify',
        platform: 'spotify',
        url: artist.url,
      },
      ...(artist.dspMatches ?? []),
    ],
  };
}

function cleanHandle(handle: string | undefined): string | null {
  const cleaned = handle?.replace(/^@/, '').trim().toLowerCase();
  return cleaned || null;
}

function deriveProfileBuilderState({
  handleDraft,
  messages,
  selectedArtist,
}: {
  readonly handleDraft: string | null;
  readonly messages: readonly UIMessage[];
  readonly selectedArtist: OnboardingArtistSelection | null;
}): OnboardingProfileBuilderState {
  let artist = artistFromSelection(selectedArtist);
  let artistConfirmed = false;
  let handle: string | null = null;
  const socialLinks: string[] = [];

  for (const message of messages) {
    for (const part of getToolParts(message)) {
      const output = part.output;

      if (isArtistConfirmedOutput(output)) {
        const confirmedArtist = artistFromConfirmedOutput(output);
        artist = confirmedArtist ?? artist;
        artistConfirmed =
          Boolean(confirmedArtist) || Boolean(output.spotifyArtistId);
      }

      if (isHandleCheckOutput(output)) {
        handle = cleanHandle(output.handle) ?? handle;
      }

      if (isSocialLinkOutput(output) && output.url) {
        socialLinks.push(output.url);
      }
    }
  }

  return {
    artist,
    artistConfirmed,
    handle: handleDraft ?? handle,
    socialLinks,
  };
}

const renderSearchSpotifyArtist: OnboardingToolRenderer = ({
  part,
  key,
  isBusy,
  onSelectArtist,
  selectedArtistId,
}) => {
  if (selectedArtistId) return null;

  const output = part.output;
  if (!(isArtistPickerOutput(output) || output === undefined)) {
    return null;
  }

  return (
    <OnboardingSpotifyArtistPickerCard
      key={key}
      state={part.state}
      output={isArtistPickerOutput(output) ? output : null}
      inputQuery={getInputQuery(part)}
      disabled={isBusy}
      onSelectArtist={onSelectArtist}
    />
  );
};

const renderConfirmSpotifyArtist: OnboardingToolRenderer = ({ part, key }) => {
  const output = part.output;
  if (!(isArtistConfirmedOutput(output) || output === undefined)) {
    return null;
  }

  return (
    <OnboardingArtistConfirmedCard
      key={key}
      state={part.state}
      output={isArtistConfirmedOutput(output) ? output : null}
    />
  );
};

const renderCheckHandle: OnboardingToolRenderer = ({
  onHandleCandidateChange,
  part,
  key,
}) => {
  const output = part.output;
  if (!(isHandleCheckOutput(output) || output === undefined)) {
    return null;
  }

  return (
    <OnboardingHandleCheckCard
      key={key}
      state={part.state}
      output={isHandleCheckOutput(output) ? output : null}
      onHandleCandidateChange={onHandleCandidateChange}
    />
  );
};

const renderProposeSocialLink: OnboardingToolRenderer = ({ part, key }) => {
  const output = part.output;
  if (!(isSocialLinkOutput(output) || output === undefined)) {
    return null;
  }

  return (
    <OnboardingSocialLinkCard
      key={key}
      state={part.state}
      output={isSocialLinkOutput(output) ? output : null}
    />
  );
};

const renderProposeNextStep: OnboardingToolRenderer = ({ part, key }) => {
  if (!isNextStepPayload(part.output)) {
    return null;
  }

  return (
    <div key={key} className='w-full max-w-[440px]'>
      <ChatProposeNextStepCard payload={part.output} />
    </div>
  );
};

const renderProposeCheckout: OnboardingToolRenderer = ({ part, key }) => {
  if (!isCheckoutPayload(part.output)) {
    return null;
  }

  return (
    <div key={key} className='w-full max-w-[440px]'>
      <ChatProposeCheckoutCard payload={part.output} />
    </div>
  );
};

const onboardingToolRenderers: Readonly<
  Record<string, OnboardingToolRenderer>
> = {
  checkHandle: renderCheckHandle,
  confirmSpotifyArtist: renderConfirmSpotifyArtist,
  proposeCheckout: renderProposeCheckout,
  proposeNextStep: renderProposeNextStep,
  proposeSocialLink: renderProposeSocialLink,
  searchSpotifyArtist: renderSearchSpotifyArtist,
};

function renderOnboardingTools({
  messageId,
  toolParts,
  hasMessageText,
  isBusy,
  onHandleCandidateChange,
  onSelectArtist,
  selectedArtistId,
}: {
  readonly messageId: string;
  readonly toolParts: readonly ToolPart[];
  readonly hasMessageText: boolean;
  readonly isBusy: boolean;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly selectedArtistId: string | null;
}) {
  const genericParts: ToolPart[] = [];
  const cards: ReactNode[] = [];

  toolParts.forEach((part, i) => {
    const toolName = getToolName(part);
    const key = part.toolCallId ?? `${messageId}-tool-${i}`;

    if (toolName === 'recordInterviewSignal') {
      return;
    }

    if (toolName === 'searchSpotifyArtist' && selectedArtistId) {
      return;
    }

    const renderer = onboardingToolRenderers[toolName];
    if (renderer) {
      const card = renderer({
        part,
        key,
        isBusy,
        onHandleCandidateChange,
        onSelectArtist,
        selectedArtistId,
      });
      if (card) {
        cards.push(card);
      }
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
  onHandleCandidateChange,
  isBusy,
  onSelectArtist,
  selectedArtistId,
}: {
  readonly displayMessages: readonly UIMessage[];
  readonly isStreaming: boolean;
  readonly lastAssistantMessageId: string | null;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly isBusy: boolean;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly selectedArtistId: string | null;
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
          <div
            key={message.id}
            className='pb-5 transition-opacity duration-fast'
          >
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
                  onHandleCandidateChange,
                  onSelectArtist,
                  selectedArtistId,
                })
              : null}
          </div>
        );
      })}
    </div>
  );
}

function isTurnstileTokenUsable(
  token: string | null,
  status: OnboardingTurnstileStatus | undefined
): boolean {
  if (!token) return false;
  return !BLOCKED_TURNSTILE_TOKEN_STATUSES.has(status);
}

function getDisplayMessages(
  messages: readonly UIMessage[],
  shouldShowThinking: boolean
): readonly UIMessage[] {
  if (!shouldShowThinking) {
    return messages;
  }

  return [
    ...messages,
    {
      id: THINKING_PLACEHOLDER_ID,
      role: 'assistant',
      parts: [],
    },
  ];
}

interface ChatErrorStatusBannerProps {
  readonly chatError: ChatError | null;
  readonly handleRetry: () => void;
  readonly isBusy: boolean;
  readonly isSubmitted: boolean;
}

function ChatErrorStatusBanner({
  chatError,
  handleRetry,
  isBusy,
  isSubmitted,
}: ChatErrorStatusBannerProps) {
  if (!chatError) return null;

  const canRetry = Boolean(chatError.failedMessage) && !chatError.retryAfter;

  return (
    <div className='px-3 py-2.5 text-[12.5px] leading-5'>
      <div role='alert' aria-live='assertive' aria-atomic='true'>
        <p className='font-medium text-primary-token'>Message paused</p>
        <p className='mt-0.5 text-secondary-token'>{chatError.message}</p>
        {canRetry ? (
          <button
            type='button'
            onClick={handleRetry}
            disabled={isBusy || isSubmitted}
            className='mt-2 inline-flex h-7 items-center rounded-[8px] border border-subtle px-2.5 text-[11.5px] font-medium text-secondary-token transition-colors duration-fast hover:border-white/15 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:opacity-50'
          >
            Retry message
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface ComposerStatusBannerProps extends ChatErrorStatusBannerProps {
  readonly shouldShowTurnstileBanner: boolean;
  readonly turnstilePanel: ReactNode;
}

function ComposerStatusBanner({
  chatError,
  handleRetry,
  isBusy,
  isSubmitted,
  shouldShowTurnstileBanner,
  turnstilePanel,
}: ComposerStatusBannerProps) {
  if (!shouldShowTurnstileBanner && !chatError) return null;

  return (
    <div className='divide-y divide-white/[0.065]'>
      {shouldShowTurnstileBanner ? (
        <div data-testid='onboarding-turnstile-slot'>{turnstilePanel}</div>
      ) : null}
      <ChatErrorStatusBanner
        chatError={chatError}
        handleRetry={handleRetry}
        isBusy={isBusy}
        isSubmitted={isSubmitted}
      />
    </div>
  );
}

interface OnboardingMessageRegionProps {
  readonly displayMessages: readonly UIMessage[];
  readonly hasConversationStarted: boolean;
  readonly isBusy: boolean;
  readonly isStreaming: boolean;
  readonly lastAssistantMessageId: string | null;
  readonly onboardingComposerSurface: ReactNode;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly profileBuilderState: OnboardingProfileBuilderState;
  readonly shouldDockComposer: boolean;
}

function OnboardingMessageRegion({
  displayMessages,
  hasConversationStarted,
  isBusy,
  isStreaming,
  lastAssistantMessageId,
  onboardingComposerSurface,
  onHandleCandidateChange,
  onSelectArtist,
  profileBuilderState,
  shouldDockComposer,
}: OnboardingMessageRegionProps) {
  if (shouldDockComposer) {
    return (
      <div className='flex flex-col gap-4'>
        <OnboardingMessageList
          displayMessages={displayMessages}
          isStreaming={isStreaming}
          lastAssistantMessageId={lastAssistantMessageId}
          isBusy={isBusy}
          onHandleCandidateChange={onHandleCandidateChange}
          onSelectArtist={onSelectArtist}
          selectedArtistId={profileBuilderState.artist?.id ?? null}
        />
        <OnboardingProfileRail placement='inline' state={profileBuilderState} />
      </div>
    );
  }

  if (!hasConversationStarted) {
    return (
      <ChatEmptyStateComposerRegion>
        <div className='w-full' data-testid='onboarding-centered-composer'>
          {onboardingComposerSurface}
        </div>
      </ChatEmptyStateComposerRegion>
    );
  }

  const conversationAboveComposer = (
    <div className='mx-auto flex w-full max-w-[44rem] flex-col gap-4'>
      <OnboardingMessageList
        displayMessages={displayMessages}
        isStreaming={isStreaming}
        lastAssistantMessageId={lastAssistantMessageId}
        isBusy={isBusy}
        onHandleCandidateChange={onHandleCandidateChange}
        onSelectArtist={onSelectArtist}
        selectedArtistId={profileBuilderState.artist?.id ?? null}
      />
      <OnboardingProfileRail placement='inline' state={profileBuilderState} />
    </div>
  );

  return (
    <ChatEmptyStateComposerRegion above={conversationAboveComposer}>
      <div className='w-full' data-testid='onboarding-centered-composer'>
        {onboardingComposerSurface}
      </div>
    </ChatEmptyStateComposerRegion>
  );
}

export function OnboardingChat({
  intentId,
  onConversationActivity,
  onProfileBuilderChange,
  onTurnstileRejected,
  onTurnstileRequired,
  starterPrompt,
  turnstilePanel,
  turnstileStatus,
  turnstileToken,
}: OnboardingChatProps) {
  const [input, setInput] = useState('');
  const [hasSentFirst, setHasSentFirst] = useState(false);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  const [handleDraft, setHandleDraft] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] =
    useState<OnboardingArtistSelection | null>(null);
  const chipTray = useChipTray();
  const completedUserTurnsRef = useRef(0);
  const hasTrackedChatStartedRef = useRef(false);
  const hasTrackedChatCompletedRef = useRef(false);
  const lastAttemptedMessageRef = useRef<string | null>(null);
  const hasInjectedStarterPromptRef = useRef(false);
  const hasAutoSubmittedStarterPromptRef = useRef(false);
  const hasRequestedStarterVerificationRef = useRef(false);
  const pendingStarterPromptRef = useRef<string | null>(null);
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
      if (metadata.errorCode === 'TURNSTILE_REQUIRED') {
        setHasSentFirst(false);
        onTurnstileRejected?.();
      }
    },
  });

  const isSubmitted = status === 'submitted';
  const isStreaming = status === 'streaming';
  const isBusy = isSubmitted || isStreaming;
  const requiresTurnstile = process.env.NODE_ENV !== 'development';
  const isAwaitingFirstToken =
    requiresTurnstile &&
    !hasSentFirst &&
    !isTurnstileTokenUsable(turnstileToken, turnstileStatus);
  const lastMessage = messages[messages.length - 1];
  const shouldShowThinking = isBusy && lastMessage?.role === 'user';
  const displayMessages = getDisplayMessages(messages, shouldShowThinking);
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
      const text = composeMessage(chipTray.chips, rawText).trim();
      if (!text || isBusy) return;
      if (isAwaitingFirstToken) {
        setChatError(null);
        onTurnstileRequired?.('Verify you are human to send');
        return;
      }
      lastAttemptedMessageRef.current = text;
      setChatError(null);
      notifyJankSend();
      if (!hasTrackedChatStartedRef.current) {
        hasTrackedChatStartedRef.current = true;
        track(ONBOARDING_FUNNEL_EVENTS.CHAT_STARTED, {
          surface: 'start_chat',
        });
      }
      sendMessage({ text });
      chipTray.clear();
      setHasSentFirst(true);
      setInput('');
    },
    [
      chipTray,
      isAwaitingFirstToken,
      isBusy,
      notifyJankSend,
      onTurnstileRequired,
      sendMessage,
    ]
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
      setSelectedArtist(artist);
      submitText(formatArtistSelectionMessage(artist));
    },
    [formatArtistSelectionMessage, submitText]
  );

  const profileBuilderState = useMemo(
    () => deriveProfileBuilderState({ handleDraft, messages, selectedArtist }),
    [handleDraft, messages, selectedArtist]
  );

  useEffect(() => {
    onProfileBuilderChange?.(profileBuilderState);
  }, [onProfileBuilderChange, profileBuilderState]);

  useEffect(() => {
    if (hasInjectedStarterPromptRef.current) return;
    let nextPrompt: string | null = null;

    if (intentId) {
      const intent = readHomepageIntent(intentId);
      if (intent) {
        nextPrompt = sanitizeHomepagePrompt(intent.finalPrompt);
      }
      consumeHomepageIntent(intentId);
    }

    if (!nextPrompt && starterPrompt) {
      nextPrompt = sanitizeHomepagePrompt(starterPrompt);
    }

    if (nextPrompt) {
      setInput(nextPrompt);
      pendingStarterPromptRef.current = nextPrompt;
      hasInjectedStarterPromptRef.current = true;
    }
  }, [intentId, starterPrompt]);

  useEffect(() => {
    const prompt = pendingStarterPromptRef.current;
    if (
      !prompt ||
      hasAutoSubmittedStarterPromptRef.current ||
      messages.length > 0 ||
      isBusy
    ) {
      return;
    }

    if (isAwaitingFirstToken) {
      if (!hasRequestedStarterVerificationRef.current) {
        hasRequestedStarterVerificationRef.current = true;
        onTurnstileRequired?.('Verify you are human to send');
      }
      return;
    }

    hasAutoSubmittedStarterPromptRef.current = true;
    pendingStarterPromptRef.current = null;
    submitText(prompt);
  }, [
    isAwaitingFirstToken,
    isBusy,
    messages.length,
    onTurnstileRequired,
    submitText,
  ]);

  useEffect(() => {
    if (messages.length > 0) return;
    completedUserTurnsRef.current = 0;
    hasTrackedChatCompletedRef.current = false;
  }, [messages.length]);

  useEffect(() => {
    if (status !== 'ready') return;
    const completedUserTurns = messages.filter(
      message => message.role === 'user'
    ).length;
    if (completedUserTurns <= completedUserTurnsRef.current) return;
    completedUserTurnsRef.current = completedUserTurns;
    if (!hasTrackedChatCompletedRef.current) {
      hasTrackedChatCompletedRef.current = true;
      track(ONBOARDING_FUNNEL_EVENTS.CHAT_COMPLETED, {
        surface: 'start_chat',
      });
    }
    onConversationActivity?.();
  }, [messages, onConversationActivity, status]);

  const shouldShowTurnstileBanner =
    Boolean(turnstilePanel) && isAwaitingFirstToken;
  const hasComposerStatusBanner =
    shouldShowTurnstileBanner || chatError !== null;
  const composerStatusBanner = hasComposerStatusBanner ? (
    <ComposerStatusBanner
      chatError={chatError}
      handleRetry={handleRetry}
      isBusy={isBusy}
      isSubmitted={isSubmitted}
      shouldShowTurnstileBanner={shouldShowTurnstileBanner}
      turnstilePanel={turnstilePanel}
    />
  ) : null;

  const userTurnCount = messages.filter(
    message => message.role === 'user'
  ).length;
  const hasConversationStarted = messages.length > 0 || hasSentFirst;
  const shouldDockComposer =
    chatError !== null || userTurnCount > 1 || selectedArtist !== null;

  useEffect(() => {
    if (shouldDockComposer) return;
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    scrollContainer.scrollTop = 0;
  }, [displayMessages.length, scrollContainerRef, shouldDockComposer, status]);

  const onboardingChatInputProps = {
    value: input,
    onChange: setInput,
    onSubmit: handleSubmit,
    isLoading: isBusy,
    isSubmitting: isSubmitted,
    isStreaming,
    onStop: stop,
    // Raw "Securing chat..." text is replaced in follow-up pass with
    // statusBanner skeleton treatment; placeholder stays stable.
    placeholder: 'Artist, release, or link...',
    onPickerOpenChange: setComposerPickerOpen,
    chips: chipTray.chips,
    onRemoveChipAt: chipTray.removeAt,
    onRemoveLastChip: chipTray.removeLast,
    onAddSkill: chipTray.addSkill,
    onAddEntity: chipTray.addEntity,
    shellChatV1: true,
    statusBanner: composerStatusBanner,
  } as const;
  const onboardingComposerSurface = (
    <div className='mx-auto w-full max-w-[45rem]'>
      <ChatInput {...onboardingChatInputProps} />
    </div>
  );

  return (
    <section
      className='relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-(--linear-app-content-surface)'
      aria-label='Jovie onboarding chat'
      data-testid='onboarding-chat'
      data-picker-open={composerPickerOpen ? 'true' : undefined}
    >
      {/* Scroll area (flex-1) — upper content morphs on first message */}
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className='relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8'
        aria-live='polite'
      >
        <div
          ref={shouldDockComposer ? totalSizeRef : undefined}
          className={cn(
            'mx-auto flex min-h-full w-full flex-col',
            hasConversationStarted || shouldDockComposer
              ? 'max-w-[44rem]'
              : 'max-w-[52rem]',
            !shouldDockComposer && 'justify-center'
          )}
        >
          <OnboardingMessageRegion
            displayMessages={displayMessages}
            hasConversationStarted={hasConversationStarted}
            isBusy={isBusy}
            isStreaming={isStreaming}
            lastAssistantMessageId={lastAssistantMessageId}
            onboardingComposerSurface={onboardingComposerSurface}
            onHandleCandidateChange={setHandleDraft}
            onSelectArtist={handleArtistSelect}
            profileBuilderState={profileBuilderState}
            shouldDockComposer={shouldDockComposer}
          />
        </div>
      </div>

      {shouldDockComposer ? (
        <div
          className='shrink-0 bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-6 sm:pb-5 sm:pt-2.5 lg:px-8'
          data-testid='onboarding-composer-dock'
        >
          {onboardingComposerSurface}
        </div>
      ) : null}
    </section>
  );
}
