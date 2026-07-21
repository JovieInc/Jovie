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
import {
  ONBOARDING_WIDGET_EVENTS,
  widgetEventDisplayText,
} from '@/lib/chat/onboarding-script/widget-events';
import { useAppFlag } from '@/lib/flags/client';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import { parseSocialLinkInput } from '@/lib/onboarding/social-link-parse';
import { cn } from '@/lib/utils';
import { ChatProposeCheckoutCard } from './ChatProposeCheckoutCard';
import { ChatProposeNextStepCard } from './ChatProposeNextStepCard';
import { OnboardingChatEmptyIntro } from './OnboardingChatEmptyIntro';
import type { OnboardingProfileBuilderState } from './OnboardingProfileRail';
import { OnboardingProfileRail } from './OnboardingProfileRail';
import {
  OnboardingArtistConfirmedCard,
  type OnboardingArtistSelection,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
  useArtistSelectionMessage,
} from './OnboardingToolArtifacts';
import type { OnboardingTurnstileStatus } from './OnboardingTurnstile';
import { isOnboardingLocalAutomationBypassRuntime } from './onboardingAutomationBypass';
import {
  deriveProfileBuilderState,
  findLastAssistantMessageId,
  getInputQuery,
  getMessageText,
  getOnboardingErrorMessage,
  getToolName,
  getToolParts,
  isArtistConfirmedOutput,
  isArtistPickerOutput,
  isCheckoutPayload,
  isHandleCheckOutput,
  isNextStepPayload,
  isSocialLinkOutput,
  THINKING_PLACEHOLDER_ID,
  type ToolPart,
} from './onboardingChatHelpers';

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
  /** Whether the Turnstile security chrome should appear in the composer. */
  readonly turnstilePanelVisible?: boolean;
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

const BLOCKED_TURNSTILE_TOKEN_STATUSES: ReadonlySet<
  OnboardingTurnstileStatus | undefined
> = new Set(['expired', 'timeout', 'error', 'unsupported', 'unconfigured']);

type OnboardingToolRendererArgs = {
  readonly part: ToolPart;
  readonly key: string;
  readonly isBusy: boolean;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onConfirmHandle: (handle: string) => void;
  readonly onAttachAccount: (url: string) => void;
  readonly onNoneOfTheseArtists: () => void;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly selectedArtistId: string | null;
};

type OnboardingToolRenderer = (
  args: OnboardingToolRendererArgs
) => ReactNode | null;

const renderSearchSpotifyArtist: OnboardingToolRenderer = ({
  part,
  key,
  isBusy,
  onSelectArtist,
  onNoneOfTheseArtists,
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
      onNoneOfThese={onNoneOfTheseArtists}
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
  onConfirmHandle,
  part,
  key,
  isBusy,
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
      onConfirmHandle={onConfirmHandle}
      disabled={isBusy}
    />
  );
};

const renderProposeSocialLink: OnboardingToolRenderer = ({
  part,
  key,
  isBusy,
  onAttachAccount,
}) => {
  const output = part.output;
  if (!(isSocialLinkOutput(output) || output === undefined)) {
    return null;
  }

  return (
    <OnboardingSocialLinkCard
      key={key}
      state={part.state}
      output={isSocialLinkOutput(output) ? output : null}
      onAttachAccount={onAttachAccount}
      disabled={isBusy}
    />
  );
};

const renderProposeNextStep: OnboardingToolRenderer = ({ part, key }) => {
  if (!isNextStepPayload(part.output)) {
    return null;
  }

  return (
    <div key={key} className='w-full max-w-110'>
      <ChatProposeNextStepCard payload={part.output} />
    </div>
  );
};

const renderProposeCheckout: OnboardingToolRenderer = ({ part, key }) => {
  if (!isCheckoutPayload(part.output)) {
    return null;
  }

  return (
    <div key={key} className='w-full max-w-110'>
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
  onConfirmHandle,
  onAttachAccount,
  onNoneOfTheseArtists,
  onSelectArtist,
  selectedArtistId,
}: {
  readonly messageId: string;
  readonly toolParts: readonly ToolPart[];
  readonly hasMessageText: boolean;
  readonly isBusy: boolean;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onConfirmHandle: (handle: string) => void;
  readonly onAttachAccount: (url: string) => void;
  readonly onNoneOfTheseArtists: () => void;
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
        onConfirmHandle,
        onAttachAccount,
        onNoneOfTheseArtists,
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
  onConfirmHandle,
  onAttachAccount,
  onNoneOfTheseArtists,
  isBusy,
  onSelectArtist,
  selectedArtistId,
}: {
  readonly displayMessages: readonly UIMessage[];
  readonly isStreaming: boolean;
  readonly lastAssistantMessageId: string | null;
  readonly onHandleCandidateChange: (handle: string | null) => void;
  readonly onConfirmHandle: (handle: string) => void;
  readonly onAttachAccount: (url: string) => void;
  readonly onNoneOfTheseArtists: () => void;
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
                  onConfirmHandle,
                  onAttachAccount,
                  onNoneOfTheseArtists,
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

function rollbackFailedUserTurn(
  messages: readonly UIMessage[],
  failedText: string | null | undefined
): readonly UIMessage[] {
  const trimmedFailed = failedText?.trim();
  if (!trimmedFailed) return messages;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    if (getMessageText(message).trim() === trimmedFailed) {
      return messages.slice(0, index);
    }
    break;
  }

  return messages;
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
    <div className='px-3 py-2.5 text-xs leading-5'>
      <div role='alert' aria-live='assertive' aria-atomic='true'>
        <p className='font-medium text-primary-token'>Message paused</p>
        <p className='mt-0.5 text-secondary-token'>{chatError.message}</p>
        {canRetry ? (
          <button
            type='button'
            onClick={handleRetry}
            disabled={isBusy || isSubmitted}
            className='mt-2 inline-flex h-7 items-center rounded-lg border border-subtle px-2.5 text-2xs font-medium text-secondary-token transition-colors duration-fast hover:border-white/15 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:opacity-50'
          >
            Retry message
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface ComposerStatusBannerProps extends ChatErrorStatusBannerProps {
  readonly reserveTurnstileSpace?: boolean;
  readonly shouldShowTurnstileBanner: boolean;
  readonly turnstilePanel: ReactNode;
}

function ComposerStatusBanner({
  chatError,
  handleRetry,
  isBusy,
  isSubmitted,
  reserveTurnstileSpace = false,
  shouldShowTurnstileBanner,
  turnstilePanel,
}: ComposerStatusBannerProps) {
  if (!shouldShowTurnstileBanner && !chatError) return null;

  return (
    <div className='divide-y divide-white/[0.065]'>
      {shouldShowTurnstileBanner ? (
        <div
          className={reserveTurnstileSpace ? 'min-h-[10rem]' : undefined}
          data-testid='onboarding-turnstile-slot'
        >
          {turnstilePanel}
        </div>
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
  readonly onConfirmHandle: (handle: string) => void;
  readonly onAttachAccount: (url: string) => void;
  readonly onNoneOfTheseArtists: () => void;
  readonly onSelectArtist: (artist: OnboardingArtistSelection) => void;
  readonly onSelectStarterSuggestion: (prompt: string) => void;
  readonly profileBuilderState: OnboardingProfileBuilderState;
  readonly shouldDockComposer: boolean;
  readonly showEmptyIntro: boolean;
  readonly composerPickerOpen: boolean;
}

function OnboardingMessageRegion({
  composerPickerOpen,
  displayMessages,
  hasConversationStarted,
  isBusy,
  isStreaming,
  lastAssistantMessageId,
  onboardingComposerSurface,
  onHandleCandidateChange,
  onConfirmHandle,
  onAttachAccount,
  onNoneOfTheseArtists,
  onSelectArtist,
  onSelectStarterSuggestion,
  profileBuilderState,
  shouldDockComposer,
  showEmptyIntro,
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
          onConfirmHandle={onConfirmHandle}
          onAttachAccount={onAttachAccount}
          onNoneOfTheseArtists={onNoneOfTheseArtists}
          onSelectArtist={onSelectArtist}
          selectedArtistId={profileBuilderState.artist?.id ?? null}
        />
        <OnboardingProfileRail placement='inline' state={profileBuilderState} />
      </div>
    );
  }

  if (!hasConversationStarted) {
    return (
      <ChatEmptyStateComposerRegion
        above={
          showEmptyIntro ? (
            <OnboardingChatEmptyIntro
              onSelectSuggestion={onSelectStarterSuggestion}
              dimmed={composerPickerOpen}
              isBusy={isBusy}
            />
          ) : undefined
        }
      >
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
        onConfirmHandle={onConfirmHandle}
        onAttachAccount={onAttachAccount}
        onNoneOfTheseArtists={onNoneOfTheseArtists}
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
  turnstilePanelVisible = false,
  turnstileStatus,
  turnstileToken,
}: OnboardingChatProps) {
  const initialStarterPrompt = starterPrompt
    ? sanitizeHomepagePrompt(starterPrompt)
    : '';
  const hasInitialStarterPrompt = initialStarterPrompt.length > 0;
  const [input, setInput] = useState(initialStarterPrompt);
  const latestInputRef = useRef(initialStarterPrompt);
  const [hasSentFirst, setHasSentFirst] = useState(false);
  const [verificationRequested, setVerificationRequested] = useState(false);
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
  const hasInjectedStarterPromptRef = useRef(hasInitialStarterPrompt);
  const hasAutoSubmittedStarterPromptRef = useRef(false);
  const hasRequestedStarterVerificationRef = useRef(false);
  const pendingStarterPromptRef = useRef<string | null>(
    hasInitialStarterPrompt ? initialStarterPrompt : null
  );
  const wasAwaitingTurnstileRetryRef = useRef(false);
  const [localAutomationBypass, setLocalAutomationBypass] = useState<
    boolean | null
  >(null);
  const formatArtistSelectionMessage = useArtistSelectionMessage();

  const setComposerInput = useCallback((nextInput: string) => {
    latestInputRef.current = nextInput;
    setInput(nextInput);
  }, []);

  useEffect(() => {
    setLocalAutomationBypass(isOnboardingLocalAutomationBypassRuntime());
  }, []);

  useEffect(() => {
    if (isTurnstileTokenUsable(turnstileToken, turnstileStatus)) {
      setVerificationRequested(false);
    }
  }, [turnstileStatus, turnstileToken]);

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

  const { messages, sendMessage, setMessages, status, stop } = useChat({
    id: 'onboarding',
    transport,
    onError: error => {
      const type = getErrorType(error);
      const metadata = extractErrorMetadata(error);
      const message = getPreferredErrorMessage(error, type, metadata);
      const failedMessage = lastAttemptedMessageRef.current ?? undefined;
      setChatError({
        type,
        message: getOnboardingErrorMessage(message),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId: metadata.requestId,
        failedMessage,
      });
      if (failedMessage) {
        setComposerInput(failedMessage);
        setMessages(current => [
          ...rollbackFailedUserTurn(current, failedMessage),
        ]);
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
  const requiresTurnstile =
    process.env.NODE_ENV !== 'development' && localAutomationBypass !== true;
  const isAwaitingFirstToken =
    localAutomationBypass !== null &&
    requiresTurnstile &&
    !hasSentFirst &&
    !isTurnstileTokenUsable(turnstileToken, turnstileStatus);
  const lastMessage = messages[messages.length - 1];
  const shouldShowThinking = isBusy && lastMessage?.role === 'user';
  const displayMessages = getDisplayMessages(messages, shouldShowThinking);
  const lastAssistantMessageId = findLastAssistantMessageId(displayMessages);
  const { isStuckToBottom, onScroll, totalSizeRef, scrollContainerRef } =
    useStickToBottom();
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
    (rawText: string, metadata?: Record<string, unknown>) => {
      const text = composeMessage(chipTray.chips, rawText).trim();
      if (!text || isBusy || localAutomationBypass === null) return;
      if (isAwaitingFirstToken) {
        setVerificationRequested(true);
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
      sendMessage({ text, ...(metadata ? { metadata } : {}) });
      chipTray.clear();
      setHasSentFirst(true);
      setComposerInput('');
    },
    [
      chipTray,
      isAwaitingFirstToken,
      isBusy,
      localAutomationBypass,
      notifyJankSend,
      onTurnstileRequired,
      sendMessage,
      setComposerInput,
    ]
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      submitText(latestInputRef.current);
    },
    [submitText]
  );

  const handleInputChange = useCallback(
    (nextInput: string) => {
      setComposerInput(nextInput);

      if (
        hasInjectedStarterPromptRef.current &&
        !hasAutoSubmittedStarterPromptRef.current &&
        messages.length === 0
      ) {
        pendingStarterPromptRef.current = nextInput.trim() ? nextInput : null;
      }
    },
    [messages.length, setComposerInput]
  );

  const handleRetry = useCallback(() => {
    const failedMessage = chatError?.failedMessage;
    if (!failedMessage) return;
    submitText(failedMessage);
  }, [chatError?.failedMessage, submitText]);

  const handleArtistSelect = useCallback(
    (artist: OnboardingArtistSelection) => {
      setSelectedArtist(artist);
      // The Spotify id rides as message metadata (not visible text) so the
      // server — LLM tools and the deterministic fallback engine alike — can
      // confirm the exact artist without parsing the display name.
      submitText(formatArtistSelectionMessage(artist), {
        spotifyArtistId: artist.id,
      });
    },
    [formatArtistSelectionMessage, submitText]
  );

  const handleConfirmHandle = useCallback(
    (handle: string) => {
      const payload = {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED,
        handle,
      } as const;
      submitText(widgetEventDisplayText(payload), payload);
    },
    [submitText]
  );

  const handleAttachAccount = useCallback(
    (url: string) => {
      // Fail closed: incomplete hosts (e.g. instagram.com/) never advance the SM.
      const parsed = parseSocialLinkInput(url);
      if (!parsed.ok) return;
      const payload = {
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED,
        url: parsed.url,
      } as const;
      submitText(widgetEventDisplayText(payload), payload);
    },
    [submitText]
  );

  const handleNoneOfTheseArtists = useCallback(() => {
    const payload = {
      onboardingEvent: ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE,
    } as const;
    setSelectedArtist(null);
    submitText(widgetEventDisplayText(payload), payload);
  }, [submitText]);

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
      setComposerInput(nextPrompt);
      pendingStarterPromptRef.current = nextPrompt;
      hasInjectedStarterPromptRef.current = true;
    }
  }, [intentId, setComposerInput, starterPrompt]);

  useEffect(() => {
    const prompt = pendingStarterPromptRef.current;
    if (
      !prompt ||
      hasAutoSubmittedStarterPromptRef.current ||
      localAutomationBypass === null ||
      messages.length > 0 ||
      isBusy
    ) {
      return;
    }

    if (isAwaitingFirstToken) {
      if (!hasRequestedStarterVerificationRef.current) {
        hasRequestedStarterVerificationRef.current = true;
        setVerificationRequested(true);
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
    localAutomationBypass,
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
    if (isAwaitingFirstToken) {
      if (chatError?.errorCode === 'TURNSTILE_REQUIRED') {
        wasAwaitingTurnstileRetryRef.current = true;
      }
      return;
    }

    if (!wasAwaitingTurnstileRetryRef.current) return;
    if (chatError?.errorCode !== 'TURNSTILE_REQUIRED') return;
    if (!chatError.failedMessage || isBusy) return;

    wasAwaitingTurnstileRetryRef.current = false;
    const failedMessage = chatError.failedMessage;
    setChatError(null);
    submitText(failedMessage);
  }, [
    chatError,
    isAwaitingFirstToken,
    isBusy,
    submitText,
    turnstileStatus,
    turnstileToken,
  ]);

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

  const shouldReserveStarterVerification =
    hasInitialStarterPrompt &&
    messages.length === 0 &&
    !hasSentFirst &&
    chatError === null &&
    !isTurnstileTokenUsable(turnstileToken, turnstileStatus) &&
    localAutomationBypass !== true;
  const shouldShowTurnstileBanner =
    Boolean(turnstilePanel) &&
    (turnstilePanelVisible ||
      shouldReserveStarterVerification ||
      verificationRequested) &&
    (isAwaitingFirstToken ||
      shouldReserveStarterVerification ||
      verificationRequested);
  const hasComposerStatusBanner =
    shouldShowTurnstileBanner || chatError !== null;
  const composerStatusBanner = hasComposerStatusBanner ? (
    <ComposerStatusBanner
      chatError={chatError}
      handleRetry={handleRetry}
      isBusy={isBusy}
      isSubmitted={isSubmitted}
      reserveTurnstileSpace={shouldReserveStarterVerification}
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
  const showEmptyIntro = !intentId && !starterPrompt;

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
    onChange: handleInputChange,
    onSubmit: handleSubmit,
    isLoading: isBusy,
    isSubmitting: isSubmitted,
    isStreaming,
    onStop: stop,
    // Raw "Securing chat..." text is replaced in follow-up pass with
    // statusBanner skeleton treatment. Handle step gets a confirm-oriented
    // placeholder so incomplete free-text is less tempting.
    placeholder: handleDraft
      ? 'Confirm handle or type a different one…'
      : 'Artist, release, or link...',
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
      aria-label='Jovie Onboarding Chat'
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
            composerPickerOpen={composerPickerOpen}
            displayMessages={displayMessages}
            hasConversationStarted={hasConversationStarted}
            isBusy={isBusy}
            isStreaming={isStreaming}
            lastAssistantMessageId={lastAssistantMessageId}
            onboardingComposerSurface={onboardingComposerSurface}
            onHandleCandidateChange={setHandleDraft}
            onConfirmHandle={handleConfirmHandle}
            onAttachAccount={handleAttachAccount}
            onNoneOfTheseArtists={handleNoneOfTheseArtists}
            onSelectArtist={handleArtistSelect}
            onSelectStarterSuggestion={submitText}
            profileBuilderState={profileBuilderState}
            shouldDockComposer={shouldDockComposer}
            showEmptyIntro={showEmptyIntro}
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
