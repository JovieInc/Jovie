'use client';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';

/** Map platform ID to display name */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  twitch: 'Twitch',
  linktree: 'Linktree',
  facebook: 'Facebook',
  threads: 'Threads',
  snapchat: 'Snapchat',
  unknown: 'Unknown',
};

const PRIMARY_GOAL_LABELS: Record<string, string> = {
  streams: 'Streams',
  merch: 'Merch',
  tickets: 'Tickets',
};

/** Map status to badge variant */
const STATUS_VARIANTS: Record<
  string,
  'primary' | 'secondary' | 'success' | 'error' | 'warning'
> = {
  new: 'secondary',
  invited: 'primary',
  claimed: 'success',
  rejected: 'error',
};

export interface WaitlistTableProps {
  entries: WaitlistEntryRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function WaitlistTable({
  entries,
  page,
  pageSize,
  total,
}: WaitlistTableProps) {
  const [rows, setRows] = useState<WaitlistEntryRow[]>(entries);
  const [approveStatuses, setApproveStatuses] = useState<
    Record<string, 'idle' | 'loading' | 'success' | 'error'>
  >({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    setRows(entries);
  }, [entries]);

  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = (targetPage: number): string => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('pageSize', String(pageSize));
    const query = params.toString();
    return query.length > 0
      ? `/app/admin/waitlist?${query}`
      : '/app/admin/waitlist';
  };

  const prevHref = canPrev ? buildHref(page - 1) : undefined;
  const nextHref = canNext ? buildHref(page + 1) : undefined;

  // Virtualization for table rows
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 60, // Estimated row height in pixels
    overscan: 5, // Render 5 extra rows above/below viewport
  });

  const approveEntry = useCallback(async (entryId: string) => {
    setApproveStatuses(prev => ({ ...prev, [entryId]: 'loading' }));

    try {
      const response = await fetch('/app/admin/waitlist/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ entryId }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        status?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
        return;
      }

      setRows(prev =>
        prev.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                status: 'invited',
                updatedAt: new Date(),
              }
            : entry
        )
      );

      setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
    } catch {
      setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
    }
  }, []);

  return (
    <AdminTableShell
      scrollContainerRef={scrollContainerRef}
      toolbar={
        <div className='flex h-14 w-full items-center gap-3 px-4'>
          <div className='text-xs text-secondary-token'>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()} entries
          </div>
        </div>
      }
      footer={
        <div className='flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-secondary-token'>
          <div>
            Page {page} of {totalPages}
          </div>
          <div className='flex items-center gap-2'>
            <Button asChild size='sm' variant='ghost' disabled={!canPrev}>
              <Link href={prevHref ?? '#'} aria-disabled={!canPrev}>
                Previous
              </Link>
            </Button>
            <Button asChild size='sm' variant='ghost' disabled={!canNext}>
              <Link href={nextHref ?? '#'} aria-disabled={!canNext}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      }
    >
      {({ stickyTopPx }) => (
        <table className='w-full min-w-[960px] border-separate border-spacing-0 text-[13px]'>
          <thead className='text-left text-secondary-token'>
            <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Name
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Email
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Primary goal
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Primary Social
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Spotify
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Heard About
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Status
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Created
              </th>
              <th
                className='sticky z-20 border-b border-subtle bg-surface-1/80 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-surface-1/70'
                style={{ top: stickyTopPx }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody
            ref={tbodyRef}
            style={{
              position: 'relative',
              height:
                rows.length > 0 ? `${rowVirtualizer.getTotalSize()}px` : 'auto',
            }}
          >
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className='px-3 py-10 text-center text-sm text-secondary-token'
                >
                  No waitlist entries yet.
                </td>
              </tr>
            ) : (
              rowVirtualizer.getVirtualItems().map(virtualRow => {
                const entry = rows[virtualRow.index];
                const platformLabel =
                  PLATFORM_LABELS[entry.primarySocialPlatform] ??
                  entry.primarySocialPlatform;
                const primaryGoalLabel = entry.primaryGoal
                  ? (PRIMARY_GOAL_LABELS[entry.primaryGoal] ??
                    entry.primaryGoal)
                  : null;
                const statusVariant =
                  STATUS_VARIANTS[entry.status] ?? 'secondary';
                const heardAboutTruncated =
                  entry.heardAbout && entry.heardAbout.length > 30
                    ? entry.heardAbout.slice(0, 30) + '…'
                    : entry.heardAbout;

                const isApproved =
                  entry.status === 'invited' || entry.status === 'claimed';
                const approveStatus = approveStatuses[entry.id] ?? 'idle';
                const isApproving = approveStatus === 'loading';

                return (
                  <tr
                    key={entry.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className='border-b border-subtle last:border-b-0 hover:bg-surface-2'
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <td className='px-3 py-3 font-medium text-primary-token'>
                      {entry.fullName}
                    </td>
                    <td className='px-3 py-3 text-secondary-token'>
                      <a
                        href={`mailto:${entry.email}`}
                        className='hover:underline'
                      >
                        {entry.email}
                      </a>
                    </td>
                    <td className='px-3 py-3 text-secondary-token'>
                      {primaryGoalLabel ? (
                        <Badge size='sm' variant='secondary'>
                          {primaryGoalLabel}
                        </Badge>
                      ) : (
                        <span className='text-tertiary-token'>—</span>
                      )}
                    </td>
                    <td className='px-3 py-3'>
                      <div className='flex items-center gap-2'>
                        <Badge size='sm' variant='secondary'>
                          {platformLabel}
                        </Badge>
                        <a
                          href={entry.primarySocialUrlNormalized}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-accent hover:underline text-xs truncate max-w-[220px]'
                        >
                          {entry.primarySocialUrlNormalized.replace(
                            /^https?:\/\//,
                            ''
                          )}
                        </a>
                      </div>
                    </td>
                    <td className='px-3 py-3 text-secondary-token'>
                      {entry.spotifyUrlNormalized ? (
                        <a
                          href={entry.spotifyUrlNormalized}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-accent hover:underline text-xs truncate max-w-[220px] block'
                        >
                          {entry.spotifyUrlNormalized.replace(
                            /^https?:\/\//,
                            ''
                          )}
                        </a>
                      ) : (
                        <span className='text-tertiary-token'>—</span>
                      )}
                    </td>
                    <td className='px-3 py-3 text-secondary-token'>
                      {entry.heardAbout ? (
                        entry.heardAbout.length > 30 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className='cursor-help'>
                                {heardAboutTruncated}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side='top' className='max-w-xs'>
                              {entry.heardAbout}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          entry.heardAbout
                        )
                      ) : (
                        <span className='text-tertiary-token'>—</span>
                      )}
                    </td>
                    <td className='px-3 py-3'>
                      <Badge size='sm' variant={statusVariant}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className='px-3 py-3 text-secondary-token whitespace-nowrap'>
                      {entry.createdAt
                        ? new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(entry.createdAt)
                        : '—'}
                    </td>
                    <td className='px-3 py-3'>
                      <div className='flex items-center justify-end gap-2'>
                        <Button
                          size='sm'
                          variant='secondary'
                          disabled={isApproved || isApproving}
                          onClick={() => {
                            void approveEntry(entry.id);
                          }}
                        >
                          {isApproved
                            ? 'Approved'
                            : isApproving
                              ? 'Approving…'
                              : 'Approve'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </AdminTableShell>
  );
}
