'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from '@/components/features/dashboard/organisms/ProfileEditPreviewCard';
import {
  encodeToolEvents,
  type PersistedToolEvent,
} from '@/lib/chat/tool-events';
import { getToolUiConfig } from '@/lib/chat/tool-ui-registry';
import { addBreadcrumb } from '@/lib/sentry/client-lite';
import { cn } from '@/lib/utils';
import { ChatAlbumArtCard } from './components/ChatAlbumArtCard';
import { ChatAnalyticsCard } from './components/ChatAnalyticsCard';
import { ChatAvatarUploadCard } from './components/ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from './components/ChatLinkConfirmationCard';
import { ChatLinkRemovalCard } from './components/ChatLinkRemovalCard';
import { ChatPitchCard } from './components/ChatPitchCard';
import type {
  ChatAlbumArtToolResult,
  ChatInsightsToolResult,
  MessagePart,
  SocialLinkRemovalToolResult,
  SocialLinkToolResult,
} from './types';
import { isChatAlbumArtToolResult } from './types';

type ToolRendererVariant = 'chat' | 'inline';

interface ToolPartsRendererProps {
  readonly parts: readonly MessagePart[];
  readonly profileId?: string;
  readonly variant: ToolRendererVariant;
  readonly hasMessageText?: boolean;
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

function getToolStatusTitle(event: PersistedToolEvent): string {
  const config = getToolUiConfig(event.toolName);

  switch (event.state) {
    case 'running':
      return config.loadingTitle ?? config.label;
    case 'failed':
      return config.errorTitle ?? `${config.label} Failed`;
    case 'denied':
      return `${config.label} Denied`;
    case 'needs-approval':
      return `${config.label} Needs Approval`;
    case 'succeeded':
      return config.label;
  }
}

function getToolStatusBody(event: PersistedToolEvent): string | undefined {
  switch (event.state) {
    case 'running':
      return event.summary;
    case 'failed':
    case 'denied':
      return event.errorMessage ?? event.summary;
    case 'needs-approval':
      return event.errorMessage ?? 'Approval required before continuing.';
    case 'succeeded':
      return event.summary ?? 'Completed';
  }
}

function ToolStatusRow({
  event,
  variant,
}: Readonly<{
  event: PersistedToolEvent;
  variant: ToolRendererVariant;
}>) {
  const body = getToolStatusBody(event);
  const isInline = variant === 'inline';
  const isError = event.state === 'failed' || event.state === 'denied';
  const isRunning = event.state === 'running';
  const Icon = isRunning ? Loader2 : isError ? AlertCircle : CheckCircle2;

  return (
    <div
      data-testid='tool-status-row'
      data-tool-name={event.toolName}
      data-tool-state={event.state}
      role={isError ? 'alert' : 'status'}
      className={cn(
        'w-full rounded-xl border bg-surface-1 text-primary-token',
        isInline ? 'px-3 py-2.5' : 'max-w-[420px] px-3.5 py-3',
        isError
          ? 'border-red-500/20 bg-[color-mix(in_oklab,var(--color-error)_8%,var(--linear-app-content-surface))]'
          : 'border-subtle'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <span
          className={cn(
            'mt-0.5 flex shrink-0 items-center justify-center text-secondary-token',
            isRunning && 'animate-spin motion-reduce:animate-none',
            isError && 'text-red-500',
            !isRunning && !isError && 'text-green-600'
          )}
        >
          <Icon className={isInline ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </span>
        <div className='min-w-0'>
          <div
            className={cn(
              'truncate font-[560] tracking-[-0.01em]',
              isInline ? 'text-[12px]' : 'text-[13px]'
            )}
          >
            {getToolStatusTitle(event)}
          </div>
          {body ? (
            <div
              className={cn(
                'mt-0.5 text-secondary-token',
                isInline
                  ? 'line-clamp-2 text-[11px]'
                  : 'line-clamp-2 text-[12px]'
              )}
            >
              {body}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderArtifactCard(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (event.state !== 'succeeded') {
    return null;
  }

  if (
    event.toolName === 'proposeProfileEdit' &&
    profileId &&
    event.output?.success &&
    event.output.preview
  ) {
    return (
      <ProfileEditPreviewCard
        preview={event.output.preview as ProfileEditPreview}
        profileId={profileId}
      />
    );
  }

  if (event.toolName === 'proposeAvatarUpload' && event.output?.success) {
    return <ChatAvatarUploadCard />;
  }

  if (event.toolName === 'showTopInsights' && isInsightsResult(event.output)) {
    return <ChatAnalyticsCard result={event.output} />;
  }

  if (
    event.toolName === 'proposeSocialLink' &&
    profileId &&
    isSocialLinkResult(event.output)
  ) {
    return (
      <ChatLinkConfirmationCard
        profileId={profileId}
        platform={event.output.platform}
        normalizedUrl={event.output.normalizedUrl}
        originalUrl={event.output.originalUrl}
      />
    );
  }

  if (
    event.toolName === 'proposeSocialLinkRemoval' &&
    profileId &&
    isSocialLinkRemovalResult(event.output)
  ) {
    return (
      <ChatLinkRemovalCard
        profileId={profileId}
        linkId={event.output.linkId}
        platform={event.output.platform}
        url={event.output.url}
      />
    );
  }

  if (
    event.toolName === 'generateAlbumArt' &&
    profileId &&
    isChatAlbumArtToolResult(event.output as ChatAlbumArtToolResult)
  ) {
    return (
      <ChatAlbumArtCard
        result={event.output as ChatAlbumArtToolResult}
        profileId={profileId}
      />
    );
  }

  if (
    event.toolName === 'generateReleasePitch' &&
    isRecord(event.output) &&
    event.output.success === true &&
    isRecord(event.output.pitches)
  ) {
    return (
      <ChatPitchCard
        state='success'
        releaseTitle={
          typeof event.output.releaseTitle === 'string'
            ? event.output.releaseTitle
            : undefined
        }
        pitches={
          event.output.pitches as {
            spotify: string;
            appleMusic: string;
            amazon: string;
            generic: string;
          }
        }
      />
    );
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getRenderableToolEvents(parts: readonly MessagePart[]) {
  return encodeToolEvents(parts) ?? [];
}

export function ToolPartsRenderer({
  parts,
  profileId,
  variant,
  hasMessageText = false,
}: ToolPartsRendererProps) {
  const events = getRenderableToolEvents(parts);
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
      {events.map(event => {
        const config = getToolUiConfig(event.toolName);
        const artifactCard =
          config.renderer === 'artifact'
            ? renderArtifactCard(event, profileId)
            : null;
        const content = artifactCard ?? (
          <ToolStatusRow event={event} variant={variant} />
        );

        return (
          <div
            key={event.toolCallId}
            className={cn(hasMessageText && variant === 'chat' && 'mt-3')}
          >
            {content}
          </div>
        );
      })}
    </>
  );
}
