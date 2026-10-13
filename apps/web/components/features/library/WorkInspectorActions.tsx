'use client';

import { Button } from '@jovie/ui';
import { Copy, ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import { buildReleaseTasksRoute } from '@/constants/routes';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import {
  deriveWorkPrimaryAction,
  launchesForWork,
  type WorkLaunchSummary,
} from '@/lib/library/work-actions';

const QUIET_LINK_CLASS =
  'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token';

function workPageUrl(asset: LibraryReleaseAsset): string | null {
  const share = asset.share;
  if (share?.visibility === 'public' && share.shareUrl) {
    return share.shareUrl;
  }
  if (asset.smartLinkPath) {
    const origin = globalThis.location?.origin ?? 'https://jovie.app';
    return `${origin}${asset.smartLinkPath}`;
  }
  return share?.shareUrl ?? null;
}

function WorkLaunchRow({
  launch,
  onRetry,
}: {
  readonly launch: WorkLaunchSummary;
  readonly onRetry?: ((launch: WorkLaunchSummary) => void) | undefined;
}) {
  return (
    <div
      className='rounded-xl border border-subtle bg-surface-1 px-3 py-2'
      data-testid={`work-launch-${launch.id}`}
      data-kit-status={launch.kitStatus}
    >
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <span className='min-w-0 truncate text-xs font-medium text-primary-token'>
          {launch.title}
        </span>
        <Link
          href={launch.launchHref}
          className={QUIET_LINK_CLASS}
          data-testid={`work-launch-open-${launch.id}`}
        >
          Open launch
        </Link>
      </div>

      {launch.kitStatus === 'preparing' ? (
        <p
          className='mt-1 text-xs text-secondary-token'
          role='status'
          data-testid={`work-launch-status-${launch.id}`}
        >
          Preparing press kit…
        </p>
      ) : null}

      {launch.kitStatus === 'needs_input' ? (
        <p
          className='mt-1 text-xs text-secondary-token'
          role='status'
          data-testid={`work-launch-status-${launch.id}`}
        >
          Press kit needs input
          {launch.kitStatusDetail ? `: ${launch.kitStatusDetail}` : '.'}
        </p>
      ) : null}

      {launch.kitStatus === 'failed' ? (
        <div
          className='mt-1 flex items-center justify-between gap-2'
          role='status'
          data-testid={`work-launch-status-${launch.id}`}
        >
          <span className='min-w-0 truncate text-xs text-secondary-token'>
            Press kit generation failed
            {launch.kitStatusDetail ? `: ${launch.kitStatusDetail}` : ''}
          </span>
          {onRetry ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='shrink-0'
              onClick={() => onRetry(launch)}
              data-testid={`work-launch-retry-${launch.id}`}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {launch.kitStatus === 'ready' ? (
        <div className='mt-1.5 flex flex-wrap items-center gap-1'>
          {launch.pressKitHref ? (
            <Link
              href={launch.pressKitHref}
              className={QUIET_LINK_CLASS}
              data-testid={`work-press-kit-${launch.id}`}
            >
              Review press kit
            </Link>
          ) : null}
          {launch.pressReleaseHref ? (
            <Link
              href={launch.pressReleaseHref}
              className={QUIET_LINK_CLASS}
              data-testid={`work-press-release-${launch.id}`}
            >
              View/edit press release
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WorkInspectorActions({
  asset,
  launches = [],
  canPublish,
  disabled = false,
  onSharePrivately,
  onRetryLaunchKit,
}: {
  readonly asset: LibraryReleaseAsset;
  /** Canonical launches for any work; only entries scoped to `asset.id` render. */
  readonly launches?: readonly WorkLaunchSummary[];
  readonly canPublish: boolean;
  readonly disabled?: boolean;
  /** Jumps to the private file-sharing surface (Files view). */
  readonly onSharePrivately: () => void;
  readonly onRetryLaunchKit?: (launch: WorkLaunchSummary) => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const action = useMemo(
    () => deriveWorkPrimaryAction({ asset, canPublish }),
    [asset, canPublish]
  );
  const scopedLaunches = useMemo(
    () => launchesForWork(launches, asset.id),
    [launches, asset.id]
  );
  const pageUrl = workPageUrl(asset);
  const launchWorkspaceHref = buildReleaseTasksRoute(
    asset.linkedReleaseId ?? asset.id
  );

  const handleSharePage = useCallback(async () => {
    if (!pageUrl) {
      toast.error('No public page to share yet');
      return;
    }
    try {
      await globalThis.navigator?.clipboard?.writeText(pageUrl);
      setCopied(true);
      toast.success('Page link copied');
      globalThis.setTimeout?.(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }, [pageUrl]);

  const handleAskJovie = useCallback(() => {
    openChatWithPrompt(
      `Help me with this work.\n${JSON.stringify({
        workId: asset.id,
        workTitle: asset.title,
        artist: asset.artist,
        revision: asset.updatedAt ?? null,
      })}`,
      router
    );
  }, [asset, router]);

  return (
    <div className='space-y-2' data-testid={`work-actions-${asset.id}`}>
      <div className='flex flex-wrap items-center gap-x-1.5 gap-y-2'>
        {action.kind === 'share_page' ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => {
              void handleSharePage();
            }}
            disabled={disabled}
            data-testid='work-action-share-page'
          >
            <Copy className='h-3.5 w-3.5' strokeWidth={2.25} />
            {copied ? 'Copied' : 'Share Page'}
          </Button>
        ) : null}

        {action.kind === 'review_publish' ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={disabled || action.blockedReason !== null}
            data-testid='work-action-review-publish'
            asChild={action.blockedReason === null}
          >
            {action.blockedReason === null ? (
              <Link href={launchWorkspaceHref}>Review & Publish</Link>
            ) : (
              'Review & Publish'
            )}
          </Button>
        ) : null}

        {action.kind === 'share_privately' ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onSharePrivately}
            disabled={disabled}
            data-testid='work-action-share-privately'
          >
            Share Privately
          </Button>
        ) : null}

        <div className='flex max-w-full shrink-0 flex-wrap items-center gap-1.5'>
          {action.kind === 'share_page' && pageUrl ? (
            <a
              href={pageUrl}
              target='_blank'
              rel='noopener noreferrer'
              className={QUIET_LINK_CLASS}
              data-testid='work-action-preview-page'
            >
              <ExternalLink className='h-3.5 w-3.5' strokeWidth={2.25} />
              Preview page
            </a>
          ) : null}

          <button
            type='button'
            onClick={handleAskJovie}
            className={QUIET_LINK_CLASS}
            disabled={disabled}
            data-testid='work-action-ask-jovie'
          >
            <Sparkles className='h-3.5 w-3.5' strokeWidth={2.25} />
            Ask Jovie
          </button>
        </div>
      </div>

      {action.blockedReason ? (
        <p
          className='text-xs text-secondary-token'
          role='status'
          data-testid='work-action-blocker'
        >
          {action.blockedReason}
        </p>
      ) : null}

      {scopedLaunches.length > 0 ? (
        <div className='space-y-1.5'>
          {scopedLaunches.map(launch => (
            <WorkLaunchRow
              key={launch.id}
              launch={launch}
              onRetry={onRetryLaunchKit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
