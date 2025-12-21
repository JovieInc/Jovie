'use client';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Column, Table } from '@/components/admin/table';
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

  // Define table columns
  const columns: Column<WaitlistEntryRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: entry => (
          <span className='font-medium text-primary-token'>
            {entry.fullName}
          </span>
        ),
        width: 'w-[180px]',
      },
      {
        id: 'email',
        header: 'Email',
        cell: entry => (
          <a
            href={`mailto:${entry.email}`}
            className='text-secondary-token hover:underline'
          >
            {entry.email}
          </a>
        ),
        width: 'w-[220px]',
        hideOnMobile: true,
      },
      {
        id: 'primaryGoal',
        header: 'Primary goal',
        cell: entry => {
          const primaryGoalLabel = entry.primaryGoal
            ? (PRIMARY_GOAL_LABELS[entry.primaryGoal] ?? entry.primaryGoal)
            : null;
          return primaryGoalLabel ? (
            <Badge size='sm' variant='secondary'>
              {primaryGoalLabel}
            </Badge>
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        width: 'w-[140px]',
        hideOnMobile: true,
      },
      {
        id: 'primarySocial',
        header: 'Primary Social',
        cell: entry => {
          const platformLabel =
            PLATFORM_LABELS[entry.primarySocialPlatform] ??
            entry.primarySocialPlatform;
          return (
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
                {entry.primarySocialUrlNormalized.replace(/^https?:\/\//, '')}
              </a>
            </div>
          );
        },
        width: 'w-[280px]',
        hideOnMobile: true,
      },
      {
        id: 'spotify',
        header: 'Spotify',
        cell: entry =>
          entry.spotifyUrlNormalized ? (
            <a
              href={entry.spotifyUrlNormalized}
              target='_blank'
              rel='noopener noreferrer'
              className='text-accent hover:underline text-xs truncate max-w-[220px] block'
            >
              {entry.spotifyUrlNormalized.replace(/^https?:\/\//, '')}
            </a>
          ) : (
            <span className='text-tertiary-token'>—</span>
          ),
        width: 'w-[200px]',
        hideOnMobile: true,
      },
      {
        id: 'heardAbout',
        header: 'Heard About',
        cell: entry => {
          const heardAboutTruncated =
            entry.heardAbout && entry.heardAbout.length > 30
              ? entry.heardAbout.slice(0, 30) + '…'
              : entry.heardAbout;
          return entry.heardAbout ? (
            entry.heardAbout.length > 30 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='cursor-help text-secondary-token'>
                    {heardAboutTruncated}
                  </span>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  {entry.heardAbout}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className='text-secondary-token'>{entry.heardAbout}</span>
            )
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        width: 'w-[160px]',
        hideOnMobile: true,
      },
      {
        id: 'status',
        header: 'Status',
        cell: entry => {
          const statusVariant = STATUS_VARIANTS[entry.status] ?? 'secondary';
          return (
            <Badge size='sm' variant={statusVariant}>
              {entry.status}
            </Badge>
          );
        },
        width: 'w-[110px]',
      },
      {
        id: 'created',
        header: 'Created',
        cell: entry =>
          entry.createdAt
            ? new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(entry.createdAt)
            : '—',
        width: 'w-[160px]',
        hideOnMobile: true,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: entry => {
          const isApproved =
            entry.status === 'invited' || entry.status === 'claimed';
          const approveStatus = approveStatuses[entry.id] ?? 'idle';
          const isApproving = approveStatus === 'loading';

          return (
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
          );
        },
        align: 'right',
        width: 'w-[120px]',
      },
    ],
    [approveStatuses, approveEntry]
  );

  return (
    <div className='space-y-4'>
      {/* Custom toolbar */}
      <div className='flex h-14 w-full items-center gap-3 px-4 bg-surface-0 border border-subtle rounded-lg'>
        <div className='text-xs text-secondary-token'>
          Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()} entries
        </div>
      </div>

      {/* Table */}
      <Table
        data={rows}
        columns={columns}
        getRowId={entry => entry.id}
        virtualizationThreshold={20}
        rowHeight={60}
        caption='Waitlist entries table'
      />

      {/* Custom footer with pagination */}
      <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-secondary-token bg-surface-0 border border-subtle rounded-lg'>
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
    </div>
  );
}
