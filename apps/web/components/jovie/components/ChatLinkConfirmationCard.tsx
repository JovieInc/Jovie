'use client';

import { Button } from '@jovie/ui/atoms/button';
import {
  resolveTaskPersistence,
  type TaskState,
} from '@jovie/ui/lib/task-persistence';
import { Check, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  dismissProposal,
  isProposalDismissed,
  undismissProposal,
} from '@/lib/chat/proposal-dismiss-ledger';
import { FetchError } from '@/lib/queries/fetch';
import { useConfirmChatLinkMutation } from '@/lib/queries/useConfirmChatLinkMutation';
import { cn } from '@/lib/utils';
import { CHAT_TOOL_CANCELLED_LABEL, ChatToolSurface } from './ChatToolSurface';

interface ChatLinkConfirmationCardProps {
  readonly profileId: string;
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly color: string;
  };
  readonly normalizedUrl: string;
  readonly originalUrl: string;
  /** Stable tool call id for durable dismiss/undo ledger (JOV-3549). */
  readonly toolCallId?: string;
  /** Interactive fixtures confirm locally without mutating the profile. */
  readonly preview?: boolean;
}

const LINK_MESSAGES = {
  checking: 'Checking your save…',
  draft: 'Review this link before adding it.',
  failed: 'Unable to add link. Try again.',
  notRecorded: 'No save recorded. Try Add again.',
  preview: 'Preview only. Nothing will be saved.',
  previewComplete: 'Preview complete. Nothing was saved.',
  submitting: 'Saving your link…',
  unknown: 'Save unconfirmed. Use Check save.',
} as const;

/** Canonical SocialIcon platform values. Falls back to 'link' for unknown platforms. */
const VALID_SOCIAL_PLATFORMS = new Set([
  'spotify',
  'applemusic',
  'soundcloud',
  'bandcamp',
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'youtube',
  'youtubemusic',
  'facebook',
  'discord',
  'reddit',
  'github',
  'patreon',
  'twitch',
  'linkedin',
  'snapchat',
  'pinterest',
  'threads',
  'mastodon',
  'bluesky',
  'link',
]);

function normalizeSocialPlatform(icon: string): string {
  const lower = icon.toLowerCase();
  return VALID_SOCIAL_PLATFORMS.has(lower) ? lower : 'link';
}

/** Reset task-local callbacks and state when the account or proposal changes. */
export function ChatLinkConfirmationCard(props: ChatLinkConfirmationCardProps) {
  return (
    <ChatLinkConfirmationTask
      key={`${props.profileId}:${props.toolCallId}:${props.normalizedUrl}:${props.preview}`}
      {...props}
    />
  );
}

function ChatLinkConfirmationTask({
  profileId,
  platform,
  normalizedUrl,
  originalUrl,
  toolCallId,
  preview = false,
}: ChatLinkConfirmationCardProps) {
  const dismissalId = toolCallId ? `${profileId}:${toolCallId}` : undefined;
  const [state, setState] = useState<TaskState>(() =>
    isProposalDismissed(dismissalId) ? 'canceled' : 'draft'
  );
  const [requestId] = useState(() =>
    toolCallId ? `link:${toolCallId}` : crypto.randomUUID()
  );
  const [message, setMessage] = useState<string>(
    preview ? LINK_MESSAGES.preview : LINK_MESSAGES.draft
  );
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const confirmLink = useConfirmChatLinkMutation();
  const previewPanel = usePreviewPanelContext();
  const saved = state === 'persisted-remotely';
  const unknown = state === 'acknowledgement-unknown';
  const busy = state === 'submitting';

  function handleAdd() {
    if (inFlight.current || saved || state === 'canceled') return;
    if (preview) {
      setMessage(LINK_MESSAGES.previewComplete);
      return;
    }
    const reconcile = unknown;
    inFlight.current = true;
    setState('submitting');
    setMessage(reconcile ? LINK_MESSAGES.checking : LINK_MESSAGES.submitting);
    confirmLink.mutate(
      {
        profileId,
        platform: platform.id,
        url: originalUrl,
        normalizedUrl,
        requestId,
        ...(reconcile ? { reconcile: true } : {}),
      },
      {
        onSuccess: data => {
          if (!mounted.current) return;
          inFlight.current = false;
          if (
            reconcile &&
            data.success === false &&
            data.acknowledged === false
          ) {
            setState('failed');
            setMessage(LINK_MESSAGES.notRecorded);
            return;
          }
          const next =
            data.success === true
              ? resolveTaskPersistence(
                  { scopeId: profileId, requestId },
                  data.receipt
                )
              : 'acknowledgement-unknown';
          if (next !== 'persisted-remotely') {
            setState('acknowledgement-unknown');
            setMessage(LINK_MESSAGES.unknown);
            return;
          }
          undismissProposal(dismissalId);
          setState(next);
          setMessage(
            `${platform.name} link ${data.outcome === 'updated' ? 'updated' : 'added'}.`
          );
          // Only acknowledge the live preview after a matching remote receipt.
          const receipt = data.receipt;
          if (receipt && !data.replayed && !reconcile) {
            previewPanel?.setPreviewData(snapshot =>
              snapshot
                ? {
                    ...snapshot,
                    links: [
                      ...snapshot.links.filter(
                        link => link.platform !== platform.id
                      ),
                      {
                        id: receipt.objectId,
                        title: platform.name,
                        url: normalizedUrl,
                        platform: platform.id,
                        isVisible: true,
                      },
                    ],
                  }
                : snapshot
            );
          }
        },
        onError: error => {
          if (!mounted.current) return;
          inFlight.current = false;
          // A known rejection cannot have committed. All transport, decode,
          // cancellation and server failures require read-only reconciliation.
          const rejected =
            !reconcile &&
            error instanceof FetchError &&
            error.kind === 'http' &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408;
          setState(rejected ? 'failed' : 'acknowledgement-unknown');
          setMessage(rejected ? LINK_MESSAGES.failed : LINK_MESSAGES.unknown);
        },
      }
    );
  }

  function handleDismiss() {
    if (inFlight.current || saved || unknown) return;
    if (state === 'canceled') {
      undismissProposal(dismissalId);
      setState('draft');
      setMessage(LINK_MESSAGES.draft);
    } else {
      dismissProposal(dismissalId);
      setState('canceled');
      setMessage(CHAT_TOOL_CANCELLED_LABEL);
    }
  }

  return (
    <ChatToolSurface className='system-b-chat-link-card system-b-chat-link-card-add @container'>
      <div
        className='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 @sm:grid-cols-[auto_minmax(0,1fr)_auto]'
        data-task-state={state}
      >
        <span className='system-b-chat-link-card-icon system-b-chat-link-card-icon-add'>
          <SocialIcon
            platform={normalizeSocialPlatform(platform.icon)}
            className='h-5 w-5 shrink-0'
            aria-hidden
          />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            {platform.name}
          </p>
          <p
            className='truncate text-xs text-tertiary-token'
            title={normalizedUrl}
          >
            {normalizedUrl}
          </p>
        </div>
        <div className='col-span-2 flex flex-wrap items-center justify-end gap-1.5 @sm:col-span-1'>
          <Button
            type='button'
            variant='primary'
            size='sm'
            onClick={handleAdd}
            aria-disabled={busy || saved || state === 'canceled'}
            className={cn(
              'system-b-chat-link-primary-action w-[6.5em] whitespace-nowrap',
              'border border-(--color-btn-primary-bg) bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--color-btn-primary-hover) hover:bg-btn-primary-hover',
              'aria-disabled:opacity-50 transition-colors'
            )}
          >
            {busy ? (
              <Loader2
                aria-hidden
                className='h-3 w-3 animate-spin motion-reduce:animate-none'
              />
            ) : saved ? (
              <Check aria-hidden className='h-3 w-3' />
            ) : null}
            {unknown ? 'Check save' : saved ? 'Added' : 'Add'}
          </Button>
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={handleDismiss}
            aria-disabled={busy || saved || unknown}
            className='min-w-11 px-0 text-xs font-medium text-primary-token underline-offset-2'
            data-testid={
              state === 'canceled' ? 'chat-link-dismiss-undo' : undefined
            }
            aria-label={
              state === 'canceled'
                ? `Undo dismiss ${platform.name} link`
                : `Dismiss ${platform.name} link`
            }
          >
            {state === 'canceled' ? (
              'Undo'
            ) : (
              <X aria-hidden className='h-3.5 w-3.5' />
            )}
          </Button>
        </div>
      </div>
      <div className='mt-1 grid text-xs'>
        {/* Reserve the maximum reflowed status, including large text. */}
        {[
          ...Object.values(LINK_MESSAGES),
          `${platform.name} link added.`,
          `${platform.name} link updated.`,
        ].map(text => (
          <span
            key={text}
            aria-hidden
            className='invisible col-start-1 row-start-1 min-h-8'
          >
            {text}
          </span>
        ))}
        <output
          aria-label='Link Confirmation'
          aria-live='polite'
          aria-atomic='true'
          className={cn(
            'col-start-1 row-start-1 min-h-8',
            state === 'failed' ? 'text-error' : 'text-secondary-token'
          )}
        >
          {message}
        </output>
      </div>
    </ChatToolSurface>
  );
}
