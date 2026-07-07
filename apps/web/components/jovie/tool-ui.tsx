'use client';

import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from '@/components/features/dashboard/organisms/ProfileEditPreviewCard';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { isLockedToolOutput } from '@/lib/chat/locked-tools';
import { resolveToolFailurePresentation } from '@/lib/chat/tool-errors';
import {
  encodeToolEvents,
  type PersistedToolEvent,
} from '@/lib/chat/tool-events';
import { getToolUiConfig } from '@/lib/chat/tool-ui-registry';
import { env } from '@/lib/env-client';
import { addBreadcrumb } from '@/lib/sentry/client-lite';
import { isVideoRecordingProposalPayload } from '@/lib/teleprompter/types';
import { cn } from '@/lib/utils';
import { ChatAlbumArtCard } from './components/ChatAlbumArtCard';
import { ChatAnalyticsCard } from './components/ChatAnalyticsCard';
import { ChatArtifactErrorCard } from './components/ChatArtifactErrorCard';
import { ChatAvatarUploadCard } from './components/ChatAvatarUploadCard';
import { ChatFeedbackControl } from './components/ChatFeedbackControl';
import { ChatLinkConfirmationCard } from './components/ChatLinkConfirmationCard';
import { ChatLinkRemovalCard } from './components/ChatLinkRemovalCard';
import { ChatMerchActionCard } from './components/ChatMerchActionCard';
import {
  ChatMerchOptionsCard,
  ChatMerchSelectionCard,
  isChatMerchGenerationResult,
  isChatMerchSelectionResult,
} from './components/ChatMerchCard';
import {
  ChatMerchDesignCarousel,
  isChatMerchDesignCarouselResult,
} from './components/ChatMerchDesignCarousel';
import { ChatPitchCard } from './components/ChatPitchCard';
import { ChatVideoRecordingProposalCard } from './components/ChatVideoRecordingProposalCard';
import type {
  ChatInsightsToolResult,
  MessagePart,
  SocialLinkRemovalToolResult,
  SocialLinkToolResult,
} from './types';
import { isChatAlbumArtToolResult } from './types';

type ToolRendererVariant = 'chat' | 'inline';

/**
 * Feedback context for 👍/👎 votes on tool/skill results (JOV #11460).
 * Provided by the authenticated chat surface; absent = controls hidden.
 */
export interface ChatToolFeedbackContext {
  readonly messageId: string;
  readonly turnId?: string;
  readonly conversationId?: string;
}

interface ToolPartsRendererProps {
  readonly parts: readonly MessagePart[];
  readonly profileId?: string;
  readonly variant: ToolRendererVariant;
  readonly hasMessageText?: boolean;
  readonly feedback?: ChatToolFeedbackContext;
}

/** Tool states that accept feedback (in-flight work is not votable). */
const FEEDBACK_ELIGIBLE_STATES: ReadonlySet<PersistedToolEvent['state']> =
  new Set(['succeeded', 'failed']);

function ToolEventFeedback({
  event,
  feedback,
  className,
}: Readonly<{
  event: PersistedToolEvent;
  feedback: ChatToolFeedbackContext | undefined;
  className?: string;
}>) {
  if (!feedback || !FEEDBACK_ELIGIBLE_STATES.has(event.state)) {
    return null;
  }

  return (
    <ChatFeedbackControl
      messageId={feedback.messageId}
      turnId={feedback.turnId}
      conversationId={feedback.conversationId}
      toolCallId={event.toolCallId}
      toolName={event.toolName}
      excerpt={event.summary ?? undefined}
      className={className}
    />
  );
}

function isInsightsResult(result: unknown): result is ChatInsightsToolResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}

function isSocialLinkResult(result: unknown): result is SocialLinkToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'platform' in result &&
    'normalizedUrl' in result &&
    'originalUrl' in result
  );
}

function isSocialLinkRemovalResult(
  result: unknown
): result is SocialLinkRemovalToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'linkId' in result &&
    'platform' in result &&
    'url' in result
  );
}

/**
 * Plan-locked tool result (GH #13304): success-shaped output carrying
 * `locked: true`. Renders as a quiet status row + one upgrade prompt,
 * never an error.
 */
function isLockedToolEvent(event: PersistedToolEvent): boolean {
  return event.state === 'succeeded' && isLockedToolOutput(event.output);
}

function getLockedPlanRequired(event: PersistedToolEvent): string {
  const plan = event.output?.plan_required;
  return typeof plan === 'string' && plan.length > 0 ? plan : 'Pro';
}

function getToolStatusTitle(event: PersistedToolEvent): string {
  const config = getToolUiConfig(event.toolName);

  if (isLockedToolEvent(event)) {
    return `${config.label} is a ${getLockedPlanRequired(event)} feature`;
  }

  switch (event.state) {
    case 'running':
      return config.loadingTitle ?? config.label;
    case 'failed':
      return config.errorTitle ?? `${config.label} Failed`;
    case 'denied':
      return `${config.label} denied`;
    case 'needs-approval':
      return `${config.label} needs your OK`;
    case 'succeeded':
      return config.successTitle ?? config.label;
  }
}

function getToolStatusBody(event: PersistedToolEvent): string | undefined {
  if (isLockedToolEvent(event)) {
    const reason = event.output?.reason;
    return typeof reason === 'string' && reason.length > 0
      ? reason
      : event.summary;
  }

  switch (event.state) {
    case 'running':
      return event.summary;
    case 'failed': {
      const presentation = resolveToolFailurePresentation({
        toolName: event.toolName,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage ?? event.summary,
        retryable: event.retryable,
      });
      return presentation.body;
    }
    case 'denied':
      return event.errorMessage ?? event.summary;
    case 'needs-approval':
      return event.errorMessage ?? 'Approval required before continuing.';
    case 'succeeded':
      return event.summary ?? 'Completed';
  }
}

function getToolStatusNextStep(event: PersistedToolEvent): string | undefined {
  if (event.state !== 'failed') {
    return undefined;
  }

  return resolveToolFailurePresentation({
    toolName: event.toolName,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage ?? event.summary,
    retryable: event.retryable,
  }).nextStep;
}

const TOOL_STATUS_ICONS: Record<PersistedToolEvent['state'], typeof Loader2> = {
  running: Loader2,
  failed: AlertCircle,
  denied: AlertCircle,
  succeeded: CheckCircle2,
  'needs-approval': CheckCircle2,
};

function isVerboseToolModeEnabled(): boolean {
  if (env.IS_DEV) return true;
  if (typeof globalThis.window === 'undefined') return false;

  const browserWindow = globalThis.window;
  const isVerboseQueryEnabled =
    new URLSearchParams(browserWindow.location.search).get('chatVerbose') ===
    '1';

  try {
    return (
      isVerboseQueryEnabled ||
      browserWindow.localStorage.getItem('jovie:chat-verbose') === '1'
    );
  } catch {
    return isVerboseQueryEnabled;
  }
}

function ToolActivityRow({
  event,
  variant,
  multiple,
  index,
  count,
  feedback,
}: Readonly<{
  event: PersistedToolEvent;
  variant: ToolRendererVariant;
  multiple: boolean;
  index: number;
  count: number;
  feedback?: ChatToolFeedbackContext;
}>) {
  const body = getToolStatusBody(event);
  const nextStep = getToolStatusNextStep(event);
  const isInline = variant === 'inline';
  const isError = event.state === 'failed' || event.state === 'denied';
  const isRunning = event.state === 'running';
  const isLocked = isLockedToolEvent(event);
  const Icon = isLocked ? Lock : TOOL_STATUS_ICONS[event.state];
  const showVerboseDetails = isVerboseToolModeEnabled();

  return (
    <div
      data-testid='tool-status-row'
      data-tool-name={event.toolName}
      data-tool-state={event.state}
      data-tool-locked={isLocked ? 'true' : undefined}
      role={isError ? 'alert' : 'status'}
      className={cn(
        'relative flex w-full items-start gap-2.5 text-primary-token',
        isInline ? 'py-1' : 'py-1.5'
      )}
    >
      {multiple ? (
        <span
          aria-hidden='true'
          data-testid='tool-activity-timeline-line'
          className={cn(
            'absolute left-2 w-px bg-[color-mix(in_oklab,var(--linear-app-shell-border)_70%,transparent)]',
            index === 0 ? 'top-3.5' : 'top-0',
            index === count - 1 ? 'bottom-[calc(100%_-_14px)]' : 'bottom-0'
          )}
        />
      ) : null}
      <span
        className={cn(
          'relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-(--linear-app-content-surface)',
          isRunning && 'text-secondary-token',
          isError && 'text-red-500',
          isLocked && 'text-secondary-token',
          !isRunning && !isError && !isLocked && 'text-cyan-300'
        )}
      >
        <Icon
          className={cn(
            isInline ? 'h-3.5 w-3.5' : 'h-4 w-4',
            isRunning && 'animate-spin motion-reduce:animate-none'
          )}
          strokeWidth={2.25}
        />
      </span>
      <div className='min-w-0 flex-1'>
        <div
          title={getToolStatusTitle(event)}
          className={cn(
            'truncate font-semibold tracking-tight',
            isError && 'text-red-500',
            isInline ? 'text-xs' : 'text-app'
          )}
        >
          {getToolStatusTitle(event)}
        </div>
        {body ? (
          <div
            className={cn(
              'mt-0.5 text-secondary-token',
              isInline ? 'line-clamp-2 text-2xs' : 'line-clamp-2 text-xs'
            )}
          >
            {body}
          </div>
        ) : null}
        {nextStep ? (
          <div
            className={cn(
              'mt-0.5 text-tertiary-token',
              isInline ? 'line-clamp-2 text-3xs' : 'line-clamp-2 text-2xs'
            )}
          >
            {nextStep}
          </div>
        ) : null}
        {showVerboseDetails ? (
          <details
            data-testid='chat-tool-verbose'
            className='mt-1.5 text-3xs leading-4 text-tertiary-token'
          >
            <summary className='cursor-pointer select-none text-secondary-token'>
              Verbose tool details
            </summary>
            <dl className='mt-1 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5'>
              <dt>Tool</dt>
              <dd className='min-w-0 truncate font-mono'>{event.toolName}</dd>
              <dt>State</dt>
              <dd className='font-mono'>{event.state}</dd>
              <dt>Call</dt>
              <dd className='min-w-0 truncate font-mono'>{event.toolCallId}</dd>
            </dl>
          </details>
        ) : null}
      </div>
      <ToolEventFeedback
        event={event}
        feedback={feedback}
        className='shrink-0 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/message:opacity-100'
      />
    </div>
  );
}

function ToolActivityFeed({
  events,
  variant,
  feedback,
}: Readonly<{
  events: readonly PersistedToolEvent[];
  variant: ToolRendererVariant;
  feedback?: ChatToolFeedbackContext;
}>) {
  if (events.length === 0) {
    return null;
  }

  const multiple = events.length > 1;

  return (
    <div
      data-testid='tool-activity-feed'
      data-tool-count={events.length}
      className={cn(
        'w-full text-primary-token',
        variant === 'inline' ? 'max-w-full' : 'max-w-105',
        multiple ? 'space-y-0.5' : 'space-y-0'
      )}
    >
      {events.map((event, index) => (
        <ToolActivityRow
          key={event.toolCallId}
          event={event}
          variant={variant}
          multiple={multiple}
          index={index}
          count={events.length}
          feedback={feedback}
        />
      ))}
    </div>
  );
}

function isPitchOutput(value: unknown): value is {
  readonly releaseTitle?: string;
  readonly pitch?: {
    readonly target: string;
    readonly platform: string | null;
    readonly destinationLabel: string;
    readonly audience: string;
    readonly subjectLine: string | null;
    readonly body: string;
    readonly generatedAt: string;
    readonly modelUsed: string;
  };
  readonly pitches?: {
    readonly spotify: string;
    readonly appleMusic: string;
    readonly amazon: string;
    readonly generic: string;
  };
  readonly success: true;
} {
  if (!isRecord(value) || value.success !== true) {
    return false;
  }

  if (
    value.releaseTitle !== undefined &&
    typeof value.releaseTitle !== 'string'
  ) {
    return false;
  }

  if (isRecord(value.pitch)) {
    return (
      typeof value.pitch.target === 'string' &&
      (typeof value.pitch.platform === 'string' ||
        value.pitch.platform === null) &&
      typeof value.pitch.destinationLabel === 'string' &&
      typeof value.pitch.audience === 'string' &&
      (typeof value.pitch.subjectLine === 'string' ||
        value.pitch.subjectLine === null) &&
      typeof value.pitch.body === 'string' &&
      typeof value.pitch.generatedAt === 'string' &&
      typeof value.pitch.modelUsed === 'string'
    );
  }

  if (!isRecord(value.pitches)) {
    return false;
  }

  return (
    typeof value.pitches.spotify === 'string' &&
    typeof value.pitches.appleMusic === 'string' &&
    typeof value.pitches.amazon === 'string' &&
    typeof value.pitches.generic === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ArtifactRenderer = (
  event: PersistedToolEvent,
  profileId?: string
) => ReactNode;

function renderProfileEditArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !event.output?.success || !event.output.preview) {
    return null;
  }

  return (
    <ProfileEditPreviewCard
      preview={event.output.preview as ProfileEditPreview}
      profileId={profileId}
    />
  );
}

function renderAvatarUploadArtifact(event: PersistedToolEvent): ReactNode {
  return event.output?.success ? <ChatAvatarUploadCard /> : null;
}

function renderInsightsArtifact(event: PersistedToolEvent): ReactNode {
  return isInsightsResult(event.output) ? (
    <ChatAnalyticsCard result={event.output} />
  ) : null;
}

function renderSocialLinkArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !isSocialLinkResult(event.output)) {
    return null;
  }

  return (
    <ChatLinkConfirmationCard
      profileId={profileId}
      platform={event.output.platform}
      normalizedUrl={event.output.normalizedUrl}
      originalUrl={event.output.originalUrl}
    />
  );
}

function renderSocialLinkRemovalArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !isSocialLinkRemovalResult(event.output)) {
    return null;
  }

  return (
    <ChatLinkRemovalCard
      profileId={profileId}
      linkId={event.output.linkId}
      platform={event.output.platform}
      url={event.output.url}
    />
  );
}

function renderAlbumArtArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !isChatAlbumArtToolResult(event.output)) {
    return null;
  }

  return <ChatAlbumArtCard result={event.output} profileId={profileId} />;
}

function renderReleasePitchArtifact(event: PersistedToolEvent): ReactNode {
  if (event.state === 'running') {
    return <ChatPitchCard state='loading' />;
  }

  if (event.state === 'failed') {
    return (
      <ChatPitchCard
        state='error'
        error={
          event.errorMessage ?? event.summary ?? 'Pitch generation failed.'
        }
      />
    );
  }

  if (!isPitchOutput(event.output)) {
    return null;
  }

  return (
    <ChatPitchCard
      state='success'
      releaseTitle={event.output.releaseTitle}
      pitch={event.output.pitch}
      pitches={event.output.pitches}
    />
  );
}

function renderMerchGenerationArtifact(event: PersistedToolEvent): ReactNode {
  if (isChatMerchDesignCarouselResult(event.output)) {
    return <ChatMerchDesignCarousel result={event.output} />;
  }
  if (!isChatMerchGenerationResult(event.output)) {
    return null;
  }

  return <ChatMerchOptionsCard result={event.output} />;
}

function renderMerchSelectionArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!isChatMerchSelectionResult(event.output)) {
    return null;
  }

  return <ChatMerchSelectionCard result={event.output} profileId={profileId} />;
}

interface MerchActionToolResult {
  readonly success: true;
  readonly action: 'publish_merch' | 'archive_merch' | 'unpause_merch';
  readonly merchCardId: string;
  readonly title: string;
  readonly currentStatus: string;
  readonly retailPrice: string;
}

function isMerchActionResult(result: unknown): result is MerchActionToolResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === true &&
    typeof (result as { action?: unknown }).action === 'string' &&
    typeof (result as { merchCardId?: unknown }).merchCardId === 'string'
  );
}

function merchActionFromToolName(
  toolName: string
): 'publish' | 'archive' | 'unpause' | null {
  switch (toolName) {
    case 'publishMerchCard':
      return 'publish';
    case 'unpauseMerchCard':
      return 'unpause';
    case 'deleteOrArchiveMerchCard':
      return 'archive';
    default:
      return null;
  }
}

function renderMerchActionArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !isMerchActionResult(event.output)) {
    return null;
  }

  const action = merchActionFromToolName(event.toolName);
  if (!action) return null;

  return (
    <ChatMerchActionCard
      profileId={profileId}
      merchCardId={event.output.merchCardId}
      action={action}
      title={event.output.title}
      currentStatus={event.output.currentStatus}
      retailPrice={event.output.retailPrice}
    />
  );
}

function renderVideoRecordingArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (!profileId || !isVideoRecordingProposalPayload(event.output)) {
    return null;
  }

  return (
    <ChatVideoRecordingProposalCard
      profileId={profileId}
      payload={event.output}
    />
  );
}

const ARTIFACT_RENDERERS: Partial<Record<string, ArtifactRenderer>> = {
  proposeAvatarUpload: event => renderAvatarUploadArtifact(event),
  proposeVideoRecording: (event, profileId) =>
    renderVideoRecordingArtifact(event, profileId),
  proposeProfileEdit: (event, profileId) =>
    renderProfileEditArtifact(event, profileId),
  proposeSocialLink: (event, profileId) =>
    renderSocialLinkArtifact(event, profileId),
  proposeSocialLinkRemoval: (event, profileId) =>
    renderSocialLinkRemovalArtifact(event, profileId),
  showTopInsights: event => renderInsightsArtifact(event),
  generateAlbumArt: (event, profileId) =>
    renderAlbumArtArtifact(event, profileId),
  generateReleasePitch: event => renderReleasePitchArtifact(event),
  createMerch: event => renderMerchGenerationArtifact(event),
  previewMerchOptions: event => renderMerchGenerationArtifact(event),
  selectMerchDesign: (event, profileId) =>
    renderMerchSelectionArtifact(event, profileId),
  createMerchAlternativeItem: (event, profileId) =>
    renderMerchSelectionArtifact(event, profileId),
  publishMerchCard: (event, profileId) =>
    renderMerchActionArtifact(event, profileId),
  unpauseMerchCard: (event, profileId) =>
    renderMerchActionArtifact(event, profileId),
  deleteOrArchiveMerchCard: (event, profileId) =>
    renderMerchActionArtifact(event, profileId),
};

function renderArtifactFailureCard(
  event: PersistedToolEvent
): ReactNode | null {
  const config = getToolUiConfig(event.toolName);
  const presentation = resolveToolFailurePresentation({
    toolName: event.toolName,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage ?? event.summary,
    retryable: event.retryable,
  });

  return (
    <ChatArtifactErrorCard
      title={config.errorTitle ?? `${config.label} Failed`}
      message={
        presentation.body === presentation.nextStep
          ? presentation.body
          : `${presentation.body} ${presentation.nextStep}`
      }
      retryPrompt={`Please retry ${config.label.toLowerCase()}.`}
      showRetry={presentation.recoverable}
    />
  );
}

function renderArtifactCard(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  const renderer = ARTIFACT_RENDERERS[event.toolName];

  if (event.state === 'failed') {
    return renderer?.(event, profileId) ?? renderArtifactFailureCard(event);
  }

  if (event.state === 'running') {
    return renderer?.(event, profileId) ?? null;
  }

  if (event.state !== 'succeeded') {
    return null;
  }

  return renderer?.(event, profileId) ?? null;
}

function renderToolActivityGroups({
  events,
  profileId,
  variant,
  hasMessageText,
  feedback,
}: Readonly<{
  events: readonly PersistedToolEvent[];
  profileId?: string;
  variant: ToolRendererVariant;
  hasMessageText: boolean;
  feedback?: ChatToolFeedbackContext;
}>): ReactNode[] {
  const elements: ReactNode[] = [];
  let statusEvents: PersistedToolEvent[] = [];

  const flushStatusEvents = () => {
    if (statusEvents.length === 0) {
      return;
    }

    const key = statusEvents[0]?.toolCallId ?? `status-${elements.length}`;
    elements.push(
      <div
        key={`activity:${key}`}
        className={cn(hasMessageText && variant === 'chat' && 'mt-2.5')}
      >
        <ToolActivityFeed
          events={statusEvents}
          variant={variant}
          feedback={feedback}
        />
      </div>
    );
    statusEvents = [];
  };

  for (const event of events) {
    const config = getToolUiConfig(event.toolName);
    // Locked results always render as status rows — artifact cards expect
    // real generation payloads.
    const artifactCard =
      config.renderer === 'artifact' && !isLockedToolEvent(event)
        ? renderArtifactCard(event, profileId)
        : null;

    if (!artifactCard) {
      statusEvents.push(event);
      continue;
    }

    flushStatusEvents();
    elements.push(
      <div
        key={event.toolCallId}
        className={cn(hasMessageText && variant === 'chat' && 'mt-3')}
      >
        {artifactCard}
        <ToolEventFeedback
          event={event}
          feedback={feedback}
          className='mt-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/message:opacity-100'
        />
      </div>
    );
  }

  flushStatusEvents();

  // One upgrade prompt per message, never stacked — even when the model
  // touched multiple locked tools (GH #13304).
  const firstLocked = events.find(isLockedToolEvent);
  if (firstLocked) {
    const planRequired = getLockedPlanRequired(firstLocked);
    elements.push(
      <div
        key='plan-upgrade-prompt'
        data-testid='chat-plan-upgrade-prompt'
        className='mt-2'
      >
        <UpgradeButton size='sm' variant='secondary'>
          Upgrade to {planRequired}
        </UpgradeButton>
      </div>
    );
  }

  return elements;
}

export function getRenderableToolEvents(parts: readonly MessagePart[]) {
  return encodeToolEvents(parts) ?? [];
}

export function ToolPartsRenderer({
  parts,
  profileId,
  variant,
  hasMessageText = false,
  feedback,
}: ToolPartsRendererProps) {
  const events = useMemo(() => getRenderableToolEvents(parts), [parts]);
  const loggedFallbackToolCallsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const event of events) {
      const config = getToolUiConfig(event.toolName);
      const shouldLogFallback =
        config.renderer === 'status' || event.state !== 'succeeded';

      if (
        shouldLogFallback &&
        !loggedFallbackToolCallsRef.current.has(event.toolCallId)
      ) {
        loggedFallbackToolCallsRef.current.add(event.toolCallId);
        addBreadcrumb({
          category: 'ai-chat',
          message: 'Rendered generic tool fallback',
          level: 'info',
          data: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            state: event.state,
            variant,
          },
        });
      }
    }
  }, [events, variant]);

  if (events.length === 0) {
    return null;
  }

  return (
    <>
      {renderToolActivityGroups({
        events,
        profileId,
        variant,
        hasMessageText,
        feedback,
      })}
    </>
  );
}
