'use client';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardList, ExternalLink, Mail, User } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { DateCell } from '@/components/admin/table/atoms/DateCell';
import { type ContextMenuItemType } from '@/components/admin/table/molecules/TableContextMenu';
import { UnifiedTable } from '@/components/admin/table/organisms/UnifiedTable';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import {
  PLATFORM_LABELS,
  PRIMARY_GOAL_LABELS,
  STATUS_VARIANTS,
} from './constants';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';

const columnHelper = createColumnHelper<WaitlistEntryRow>();

export function AdminWaitlistTableUnified({
  entries,
  page,
  pageSize,
  total,
}: WaitlistTableProps) {
  const { approveStatuses, approveEntry } = useApproveEntry({
    onRowUpdate: () => {
      // No-op for now since we're using server-side refresh
    },
  });

  // Helper to copy to clipboard
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // Could show a toast notification here
        console.log(`Copied ${label} to clipboard`);
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  }, []);

  // Create context menu items for a waitlist entry
  const createContextMenuItems = useCallback(
    (entry: WaitlistEntryRow): ContextMenuItemType[] => {
      const isApproved =
        entry.status === 'invited' || entry.status === 'claimed';

      return [
        {
          id: 'copy-email',
          label: 'Copy Email',
          icon: <Mail className='h-4 w-4' />,
          onClick: () => copyToClipboard(entry.email, 'email'),
        },
        {
          id: 'copy-name',
          label: 'Copy Name',
          icon: <User className='h-4 w-4' />,
          onClick: () => copyToClipboard(entry.fullName, 'name'),
        },
        {
          type: 'separator' as const,
        },
        {
          id: 'open-social',
          label: 'Open Primary Social',
          icon: <ExternalLink className='h-4 w-4' />,
          onClick: () => {
            window.open(entry.primarySocialUrlNormalized, '_blank');
          },
        },
        ...(entry.spotifyUrlNormalized
          ? [
              {
                id: 'open-spotify' as const,
                label: 'Open Spotify',
                icon: <ExternalLink className='h-4 w-4' />,
                onClick: () => {
                  window.open(entry.spotifyUrlNormalized!, '_blank');
                },
              },
            ]
          : []),
        {
          type: 'separator' as const,
        },
        {
          id: 'approve',
          label: isApproved ? 'Approved' : 'Approve',
          icon: <ClipboardList className='h-4 w-4' />,
          onClick: () => {
            if (!isApproved) {
              void approveEntry(entry.id);
            }
          },
          disabled: isApproved,
        },
      ];
    },
    [approveEntry, copyToClipboard]
  );

  // Define columns using TanStack Table
  const columns = useMemo<ColumnDef<WaitlistEntryRow, any>[]>(
    () => [
      // Name column
      columnHelper.accessor('fullName', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => (
          <span className='font-medium text-primary-token'>{getValue()}</span>
        ),
        size: 180,
      }),

      // Email column
      columnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <a
            href={`mailto:${getValue()}`}
            className='text-secondary-token hover:underline'
          >
            {getValue()}
          </a>
        ),
        size: 220,
      }),

      // Primary Goal column
      columnHelper.accessor('primaryGoal', {
        id: 'primaryGoal',
        header: 'Primary goal',
        cell: ({ getValue }) => {
          const value = getValue();
          const primaryGoalLabel = value
            ? (PRIMARY_GOAL_LABELS[value] ?? value)
            : null;
          return primaryGoalLabel ? (
            <Badge size='sm' variant='secondary'>
              {primaryGoalLabel}
            </Badge>
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        size: 140,
      }),

      // Primary Social column
      columnHelper.display({
        id: 'primarySocial',
        header: 'Primary Social',
        cell: ({ row }) => {
          const entry = row.original;
          const platformLabel =
            PLATFORM_LABELS[entry.primarySocialPlatform] ??
            entry.primarySocialPlatform;

          // Extract username from URL for display
          const urlWithoutProtocol = entry.primarySocialUrlNormalized.replace(
            /^https?:\/\//,
            ''
          );
          const username =
            urlWithoutProtocol.split('/').pop() || urlWithoutProtocol;

          return (
            <PlatformPill
              platformIcon={entry.primarySocialPlatform.toLowerCase()}
              platformName={platformLabel}
              primaryText={username}
              onClick={() =>
                window.open(entry.primarySocialUrlNormalized, '_blank')
              }
            />
          );
        },
        size: 280,
      }),

      // Spotify column
      columnHelper.accessor('spotifyUrlNormalized', {
        id: 'spotify',
        header: 'Spotify',
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) {
            return <span className='text-tertiary-token'>—</span>;
          }

          // Extract artist name from Spotify URL
          const urlWithoutProtocol = value.replace(/^https?:\/\//, '');
          const artistName = urlWithoutProtocol.split('/').pop() || 'Spotify';

          return (
            <PlatformPill
              platformIcon='spotify'
              platformName='Spotify'
              primaryText={artistName}
              onClick={() => window.open(value, '_blank')}
            />
          );
        },
        size: 200,
      }),

      // Heard About column
      columnHelper.accessor('heardAbout', {
        id: 'heardAbout',
        header: 'Heard About',
        cell: ({ getValue }) => {
          const value = getValue();
          const heardAboutTruncated =
            value && value.length > 30 ? value.slice(0, 30) + '…' : value;
          return value ? (
            value.length > 30 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='cursor-help text-secondary-token'>
                    {heardAboutTruncated}
                  </span>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  {value}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className='text-secondary-token'>{value}</span>
            )
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        size: 160,
      }),

      // Status column
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue();
          const statusVariant = STATUS_VARIANTS[status] ?? 'secondary';
          return (
            <Badge size='sm' variant={statusVariant}>
              {status}
            </Badge>
          );
        },
        size: 110,
      }),

      // Created Date column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Created',
        cell: ({ getValue }) => {
          return (
            <DateCell
              date={getValue()}
              formatOptions={{
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }}
            />
          );
        },
        size: 160,
      }),

      // Actions column
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const entry = row.original;
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
        size: 120,
      }),
    ],
    [approveStatuses, approveEntry]
  );

  // Get row className
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-base dark:hover:bg-surface-2';
  }, []);

  return (
    <UnifiedTable
      data={entries}
      columns={columns}
      isLoading={false}
      getContextMenuItems={createContextMenuItems}
      emptyState={
        <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
          <ClipboardList className='h-6 w-6' />
          <div>
            <div className='font-medium'>No waitlist entries</div>
            <div className='text-xs'>
              New waitlist signups will appear here.
            </div>
          </div>
        </div>
      }
      getRowId={row => row.id}
      getRowClassName={getRowClassName}
      enableVirtualization={true}
      rowHeight={52}
      minWidth='1100px'
      className='text-[13px]'
    />
  );
}
