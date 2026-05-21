'use client';

import { Check, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ShellListRowFrame } from '@/components/organisms/table';
import type {
  TimActionIssue,
  TimActionsResponse,
} from '@/lib/hud/linear-actions';
import { STANDARD_CACHE } from '@/lib/queries/cache-strategies';

const FETCH_URL = '/api/admin/hud/tim-actions';

// Priority display config — maps Linear priority number to label and tone
const PRIORITY_CONFIG: Record<number, { label: string; className: string }> = {
  1: {
    label: 'Urgent',
    className: 'bg-red-500/15 text-red-400 border border-red-500/20',
  },
  2: {
    label: 'High',
    className: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  },
  3: {
    label: 'Medium',
    className: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  },
  4: {
    label: 'Low',
    className: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
  },
};

const DEFAULT_PRIORITY_CONFIG = {
  label: 'No priority',
  className: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
};

function getPriorityConfig(priority: number) {
  return PRIORITY_CONFIG[priority] ?? DEFAULT_PRIORITY_CONFIG;
}

function DaysOldBadge({ daysOld }: Readonly<{ readonly daysOld: number }>) {
  const isOverdue = daysOld > 7;
  return (
    <abbr
      title={`${daysOld} days old${isOverdue ? ' — overdue' : ''}`}
      className={
        isOverdue
          ? 'text-[11px] font-semibold tabular-nums text-red-400 no-underline'
          : 'text-[11px] tabular-nums text-tertiary-token no-underline'
      }
    >
      {daysOld}d
    </abbr>
  );
}

interface ActionRowProps {
  readonly issue: TimActionIssue;
  readonly onClose: (issueId: string) => Promise<void>;
  readonly isClosing: boolean;
}

function ActionRow({ issue, onClose, isClosing }: Readonly<ActionRowProps>) {
  const priorityConfig = getPriorityConfig(issue.priority);

  return (
    <ShellListRowFrame className='flex items-center gap-3 border border-subtle bg-surface-0 px-3 py-2.5'>
      {/* Title + Linear link */}
      <div className='min-w-0 flex-1'>
        <a
          href={issue.url}
          target='_blank'
          rel='noopener noreferrer'
          className='group flex items-center gap-1.5'
        >
          <p className='truncate text-[13px] font-semibold text-primary-token transition-colors group-hover:text-warning'>
            {issue.title}
          </p>
          <ExternalLink
            className='h-3 w-3 shrink-0 text-tertiary-token opacity-0 transition-opacity group-hover:opacity-100'
            aria-hidden='true'
          />
        </a>
        <p className='mt-0.5 text-[11px] text-tertiary-token'>
          {issue.identifier}
        </p>
      </div>

      {/* Priority badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityConfig.className}`}
      >
        {priorityConfig.label}
      </span>

      {/* Age */}
      <DaysOldBadge daysOld={issue.daysOld} />

      {/* Quick-mark-done */}
      <button
        type='button'
        onClick={() => void onClose(issue.id)}
        disabled={isClosing}
        aria-label={`Mark "${issue.title}" as done`}
        className='shrink-0 rounded-lg border border-subtle bg-surface-1 p-1.5 text-tertiary-token transition-colors hover:border-warning/30 hover:bg-warning/10 hover:text-warning disabled:cursor-not-allowed disabled:opacity-40'
      >
        <Check className='h-3.5 w-3.5' aria-hidden='true' />
      </button>
    </ShellListRowFrame>
  );
}

export function TimActionRequiredSection() {
  const [data, setData] = useState<TimActionsResponse | null>(null);
  // isInitialLoad tracks whether we've ever received data — only show skeleton on first load
  const isInitialLoadRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [optimisticallyClosedIds, setOptimisticallyClosedIds] = useState<
    Set<string>
  >(new Set());

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    // Only show the skeleton on the very first load; background polls are silent
    if (isInitialLoadRef.current) {
      setIsLoading(true);
    }
    try {
      const response = await fetch(FETCH_URL, { signal });
      if (!response.ok) {
        throw new Error(`Fetch failed (${response.status})`);
      }
      const result = (await response.json()) as TimActionsResponse;
      setData(result);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Silently fail — the HUD should not break if Linear is unavailable
    } finally {
      isInitialLoadRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal).catch(() => {});

    // Poll every 5 minutes (STANDARD_CACHE staleTime)
    const intervalMs = STANDARD_CACHE.staleTime ?? 5 * 60 * 1000;
    const interval = setInterval(() => {
      fetchData(controller.signal).catch(() => {});
    }, intervalMs);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchData]);

  async function handleClose(issueId: string) {
    // Optimistic removal
    setOptimisticallyClosedIds(prev => new Set([...prev, issueId]));
    setClosingIds(prev => new Set([...prev, issueId]));

    try {
      const response = await fetch(FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorBody.error ?? `Close failed (${response.status})`);
      }

      toast.success('Marked as done in Linear');
      // Refresh the list to get latest state
      fetchData().catch(() => {});
    } catch (error) {
      // Roll back the optimistic removal
      setOptimisticallyClosedIds(prev => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
      toast.error(
        error instanceof Error ? error.message : 'Could not close issue'
      );
    } finally {
      setClosingIds(prev => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }
  }

  // Don't render the section at all if Linear is not configured and loading is done
  if (!isLoading && data && !data.available) {
    return null;
  }

  const visibleIssues = (data?.issues ?? []).filter(
    issue => !optimisticallyClosedIds.has(issue.id)
  );

  if (!isLoading && visibleIssues.length === 0) {
    return null;
  }

  return (
    <ContentSurfaceCard surface='details' className='p-3'>
      <div className='space-y-2.5'>
        {/* Section header */}
        <div className='flex items-center gap-2'>
          {/* Warning accent dot for Tim action-required state. */}
          <span
            className='h-2 w-2 shrink-0 rounded-full bg-warning'
            aria-hidden='true'
          />
          <p className='text-[12px] font-caption text-tertiary-token'>
            Tim Action Required
          </p>
          {!isLoading && visibleIssues.length > 0 ? (
            <span className='ml-auto text-[11px] tabular-nums text-tertiary-token'>
              {visibleIssues.length}
            </span>
          ) : null}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className='grid gap-2'>
            {[1, 2].map(i => (
              <div
                key={i}
                className='h-[52px] animate-pulse rounded-xl border border-subtle bg-surface-0'
                aria-hidden='true'
              />
            ))}
          </div>
        ) : (
          <div className='grid gap-2'>
            {visibleIssues.map(issue => (
              <ActionRow
                key={issue.id}
                issue={issue}
                onClose={handleClose}
                isClosing={closingIds.has(issue.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
