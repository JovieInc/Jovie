'use client';

import { Button } from '@jovie/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  decisionCardThumbnail,
  decisionCardView,
} from '@/lib/ovie/decision-card-view';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { discussDecisionHref } from './OvieInbox';
import {
  isSwipeDecision,
  useOvieInboxDecisions,
} from './useOvieInboxDecisions';

/** Minute clock so the deadline countdown stays honest while chat is open. */
function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Thumbnail({ src }: Readonly<{ readonly src: string }>) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <a
      href={src}
      target='_blank'
      rel='noopener noreferrer'
      aria-label='Open Screenshot'
      className='size-10 shrink-0 overflow-hidden rounded-md border border-subtle bg-surface-0'
    >
      <Image
        src={src}
        alt=''
        width={40}
        height={40}
        unoptimized
        className='size-full object-cover'
        data-testid='ovie-composer-dock-thumbnail'
        onError={() => setBroken(true)}
      />
    </a>
  );
}

/**
 * Summer's top pending ask, pinned above the Ovie composer so Tim approves in
 * the conversation he is already in. Same query cache and optimistic decide
 * path as the Inbox panel (`useOvieInboxDecisions`); renders nothing when no
 * ask is pending.
 */
export function OvieComposerDock() {
  const now = useNowMinute();
  const [collapsed, setCollapsed] = useState(false);
  const { query, failure, decideNow } = useOvieInboxDecisions({
    pollMs: 60_000,
  });
  const pending: readonly OvieInboxCase[] = (query.data?.cases ?? []).filter(
    isSwipeDecision
  );
  const item = pending[0];
  if (!item) return null;

  const view = decisionCardView(item, now);
  const thumbnail = decisionCardThumbnail(item.evidence);
  const failed = failure?.item.id === item.id ? failure : null;
  // A card that asks Tim says plainly what each answer does (2026-11-22: the
  // dock showed only "Approves in 4m" over a bare Approve button).
  const approveDoes =
    (view.fallback?.decision === 'approve' ? view.fallback.summary : null) ??
    item.recommendation.trim();
  const deadline = view.fallback
    ? `If you don't answer, it ${view.fallback.decision === 'approve' ? 'approves' : 'rejects'} ${view.fallback.relative ?? 'now'}.`
    : null;
  const count = `1 of ${pending.length}`;

  return (
    <section
      aria-label="Summer's Pending Ask"
      data-testid='ovie-composer-dock'
      data-collapsed={collapsed ? 'true' : undefined}
      className='mb-2 flex flex-col gap-2 rounded-xl border border-subtle bg-surface-1 px-3 py-2'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <p
          className='shrink-0 text-xs font-medium tabular-nums text-tertiary-token'
          data-testid='ovie-composer-dock-count'
        >
          {`Summer asks · ${count}`}
        </p>
        {collapsed ? (
          <p className='min-w-0 flex-1 truncate text-xs tabular-nums text-secondary-token'>
            {view.decision}
          </p>
        ) : (
          <span className='flex-1' />
        )}
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='-mr-1 size-11 shrink-0 sm:size-8'
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand Ask' : 'Collapse Ask'}
          onClick={() => setCollapsed(value => !value)}
        >
          {collapsed ? (
            <ChevronUp className='size-4' aria-hidden='true' />
          ) : (
            <ChevronDown className='size-4' aria-hidden='true' />
          )}
        </Button>
      </div>
      {collapsed ? null : (
        <div className='flex items-start gap-3' key={item.id}>
          {thumbnail ? <Thumbnail src={thumbnail} /> : null}
          <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <h3
              className='line-clamp-2 text-pretty text-sm font-medium leading-5 text-primary-token'
              data-testid='ovie-composer-dock-title'
            >
              {view.decision}
            </h3>
            {failed ? (
              <p role='alert' className='truncate text-xs text-error'>
                {failed.message}
              </p>
            ) : (
              <>
                {approveDoes ? (
                  <p
                    className='line-clamp-2 text-xs text-secondary-token'
                    data-testid='ovie-composer-dock-approve-does'
                  >
                    {`Approve: ${approveDoes}`}
                  </p>
                ) : null}
                <p
                  className='truncate text-xs text-secondary-token'
                  data-testid='ovie-composer-dock-reject-does'
                >
                  Reject: it doesn't go ahead.
                </p>
                {deadline ? (
                  <p className='truncate text-xs text-tertiary-token'>
                    {deadline}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
      {collapsed ? null : (
        <div className='flex min-h-8 items-center justify-between gap-2'>
          <Button asChild variant='ghost' size='sm' className='-ml-2.5'>
            <Link
              href={discussDecisionHref(item.id)}
              data-testid='ovie-composer-dock-discuss'
            >
              Discuss
            </Link>
          </Button>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() =>
                void decideNow(item, failed ? failed.decision : 'reject')
              }
              data-testid='ovie-composer-dock-reject'
              hidden={failed !== null}
            >
              Reject
            </Button>
            <Button
              type='button'
              variant='primary'
              size='sm'
              onClick={() =>
                void decideNow(item, failed ? failed.decision : 'approve')
              }
              data-testid='ovie-composer-dock-approve'
            >
              {failed ? 'Retry' : 'Approve'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
