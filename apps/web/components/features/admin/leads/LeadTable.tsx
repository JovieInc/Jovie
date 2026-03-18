'use client';

import { Badge } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  PageToolbar,
  PageToolbarSearchForm,
  PageToolbarTabButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import {
  type AdminLead,
  type AdminLeadsSortBy,
  queryKeys,
  useLeadsInfiniteQuery,
  useUpdateLeadStatusMutation,
} from '@/lib/queries';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'discovered', label: 'Discovered' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'disqualified', label: 'Disqualified' },
  { value: 'approved', label: 'Approved' },
  { value: 'ingested', label: 'Ingested' },
  { value: 'rejected', label: 'Rejected' },
] as const;

const STATUS_VARIANT: Record<
  string,
  'primary' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  discovered: 'secondary',
  qualified: 'success',
  disqualified: 'error',
  approved: 'primary',
  ingested: 'secondary',
  rejected: 'error',
};

const columnHelper = createColumnHelper<AdminLead>();

interface LeadTableProps {
  readonly refreshKey?: number;
}

function LeadActionsCell({
  lead,
  onUpdateStatus,
  actioningId,
}: {
  readonly lead: AdminLead;
  readonly onUpdateStatus: (
    id: string,
    status: 'approved' | 'rejected'
  ) => void;
  readonly actioningId: string | null;
}) {
  if (lead.status !== 'qualified' && lead.status !== 'discovered') {
    return null;
  }

  return (
    <div className='flex gap-1'>
      <button
        type='button'
        onClick={() => onUpdateStatus(lead.id, 'approved')}
        disabled={actioningId === lead.id}
        className='rounded-md p-1 text-success hover:bg-success/10 disabled:opacity-50'
        title='Approve & ingest'
      >
        {actioningId === lead.id ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <Check className='h-4 w-4' />
        )}
      </button>
      <button
        type='button'
        onClick={() => onUpdateStatus(lead.id, 'rejected')}
        disabled={actioningId === lead.id}
        className='rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50'
        title='Reject'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
}

export function LeadTable({ refreshKey = 0 }: LeadTableProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const sortBy: AdminLeadsSortBy = 'createdAt';
  const [actioningId, setActioningId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useLeadsInfiniteQuery({
    sortBy,
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const updateLeadStatusMutation = useUpdateLeadStatusMutation();

  const leads = useMemo(
    () => data?.pages.flatMap(page => page.rows) ?? [],
    [data]
  );

  useEffect(() => {
    if (refreshKey > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.all(),
      });
    }
  }, [queryClient, refreshKey]);

  const updateLeadStatus = useCallback(
    async (id: string, status: 'approved' | 'rejected') => {
      setActioningId(id);
      try {
        const result = await updateLeadStatusMutation.mutateAsync({
          id,
          status,
        });

        if (status === 'approved' && result.ingestion) {
          if (result.ingestion.success) {
            toast.success(
              `Lead approved and ingested as @${result.ingestion.profileUsername}`
            );
          } else {
            toast.warning(
              `Lead approved but ingestion failed: ${result.ingestion.error}`
            );
          }
        } else {
          toast.success(`Lead ${status}`);
        }

        await queryClient.invalidateQueries({
          queryKey: queryKeys.admin.leads.all(),
        });
      } catch {
        toast.error(`Failed to ${status} lead`);
      } finally {
        setActioningId(null);
      }
    },
    [updateLeadStatusMutation, queryClient]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayName', {
        header: 'Name / Handle',
        size: 200,
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div className='flex flex-col'>
              <span className='font-medium text-primary-token'>
                {lead.displayName || lead.linktreeHandle}
              </span>
              <a
                href={lead.linktreeUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center gap-1 text-secondary-token hover:text-primary-token'
              >
                @{lead.linktreeHandle}
                <ExternalLink className='h-3 w-3' />
              </a>
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 100,
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
              {status}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('fitScore', {
        header: 'Score',
        size: 70,
        cell: ({ getValue }) => (
          <span className='tabular-nums'>{getValue() ?? '-'}</span>
        ),
      }),
      columnHelper.display({
        id: 'signals',
        header: 'Signals',
        size: 180,
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div className='flex gap-1'>
              {lead.hasSpotifyLink && (
                <Badge variant='secondary' className='text-2xs'>
                  Spotify
                </Badge>
              )}
              {lead.hasPaidTier && (
                <Badge variant='secondary' className='text-2xs'>
                  Paid
                </Badge>
              )}
              {lead.hasInstagram && (
                <Badge variant='secondary' className='text-2xs'>
                  IG
                </Badge>
              )}
              {lead.contactEmail && (
                <Badge variant='secondary' className='text-2xs'>
                  Email
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'tools',
        header: 'Tools',
        size: 140,
        cell: ({ row }) => {
          const tools = row.original.musicToolsDetected;
          if (tools.length === 0) {
            return <span className='text-tertiary-token'>-</span>;
          }
          return (
            <span className='text-secondary-token'>{tools.join(', ')}</span>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 80,
        cell: ({ row }) => (
          <LeadActionsCell
            lead={row.original}
            onUpdateStatus={updateLeadStatus}
            actioningId={actioningId}
          />
        ),
      }),
    ],
    [updateLeadStatus, actioningId]
  );

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return (
    <section className='flex flex-col'>
      <PageToolbar
        start={
          <>
            {STATUS_OPTIONS.map(opt => (
              <PageToolbarTabButton
                key={opt.value}
                label={opt.label}
                active={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
              />
            ))}
          </>
        }
        end={
          <PageToolbarSearchForm
            compact
            searchValue={search}
            onSearchValueChange={setSearch}
            placeholder='Search handle or name...'
            ariaLabel='Search leads'
            submitAriaLabel='Search leads'
            submitIcon={<Search className='h-3.5 w-3.5' />}
            clearIcon={<X className='h-3.5 w-3.5' />}
            onClearAction={() => setSearch('')}
            tooltipLabel='Search'
          />
        }
      />
      {isError && leads.length > 0 && (
        <div className='flex items-center gap-2 border-b border-subtle bg-warning/5 px-4 py-2 text-[13px] text-warning'>
          <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
          Unable to refresh leads. Showing cached data.
        </div>
      )}
      <UnifiedTable
        data={leads}
        columns={columns as ColumnDef<AdminLead, unknown>[]}
        isLoading={isLoading}
        getRowId={row => row.id}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={handleLoadMore}
        emptyState={
          isError ? (
            <TableEmptyState
              title='Unable to load leads'
              description='Try again in a moment.'
            />
          ) : (
            <TableEmptyState
              title='No leads found'
              description={
                statusFilter
                  ? 'Try a different status filter'
                  : 'No leads have been discovered yet'
              }
            />
          )
        }
      />
    </section>
  );
}
