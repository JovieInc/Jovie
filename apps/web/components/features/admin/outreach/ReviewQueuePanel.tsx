'use client';

import { Badge } from '@jovie/ui';
import {
  type CellContext,
  type ColumnDef,
  createColumnHelper,
} from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { toast } from '@/components/feedback';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTablePagination } from '@/features/admin/table/AdminTablePagination';

interface ReviewLead {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  instagramHandle: string | null;
  priorityScore: number | null;
  fitScore: number | null;
  outreachStatus: string;
  signals: {
    emailSuspicious?: boolean;
    emailInvalid?: boolean;
    hasRepresentation?: boolean;
  };
}

interface ReviewQueueResponse {
  items: ReviewLead[];
  total: number;
  page: number;
  limit: number;
}

const SIGNAL_CONFIG: Record<
  string,
  { label: string; variant: 'warning' | 'error' | 'primary' }
> = {
  emailSuspicious: { label: 'Suspicious Email', variant: 'warning' },
  emailInvalid: { label: 'Invalid Email', variant: 'error' },
  hasRepresentation: { label: 'Has Representation', variant: 'primary' },
};

const reviewQueueColumnHelper = createColumnHelper<ReviewLead>();

interface ReviewLeadActionsProps {
  readonly id: string;
  readonly isSkipping: boolean;
  readonly onSkip: (id: string) => Promise<void>;
}

function ReviewLeadActions({ id, isSkipping, onSkip }: ReviewLeadActionsProps) {
  return (
    <DrawerButton
      tone='secondary'
      size='sm'
      onClick={() => {
        onSkip(id).catch(() => {});
      }}
      disabled={isSkipping}
      className='h-8 px-3 text-xs'
    >
      {isSkipping ? (
        <LoadingSpinner size='sm' tone='muted' className='mr-1.5' />
      ) : null}
      Skip
    </DrawerButton>
  );
}

function renderActionsCell(
  { row }: CellContext<ReviewLead, unknown>,
  skippingIds: Set<string>,
  onSkip: (id: string) => Promise<void>
) {
  const leadId = row.original.id;
  return (
    <ReviewLeadActions
      id={leadId}
      isSkipping={skippingIds.has(leadId)}
      onSkip={onSkip}
    />
  );
}

function createReviewQueueColumns(
  handleSkip: (id: string) => Promise<void>,
  skippingIds: Set<string>
): ColumnDef<ReviewLead, unknown>[] {
  return [
    reviewQueueColumnHelper.accessor('displayName', {
      header: 'Name',
      cell: ({ getValue }) => (
        <span className='font-semibold text-primary-token'>
          {getValue() || '-'}
        </span>
      ),
      size: 180,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.accessor('priorityScore', {
      header: 'Priority',
      cell: ({ getValue }) => (
        <span className='tabular-nums'>{getValue() ?? '-'}</span>
      ),
      size: 92,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.accessor('fitScore', {
      header: 'Fit score',
      cell: ({ getValue }) => (
        <span className='tabular-nums'>{getValue() ?? '-'}</span>
      ),
      size: 92,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.accessor('contactEmail', {
      header: 'Email',
      cell: ({ getValue }) => (
        <span className='text-secondary-token'>{getValue() || '-'}</span>
      ),
      size: 220,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.accessor('instagramHandle', {
      header: 'Instagram',
      cell: ({ getValue }) => {
        const handle = getValue();
        return handle ? (
          <a
            href={`https://instagram.com/${handle}`}
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-1 text-secondary-token hover:text-primary-token'
          >
            @{handle}
            <ExternalLink className='size-3' aria-hidden='true' />
          </a>
        ) : (
          <span className='text-tertiary-token'>-</span>
        );
      },
      size: 150,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.accessor('signals', {
      header: 'Signals',
      cell: ({ getValue }) => (
        <div className='flex flex-wrap gap-1'>
          {Object.entries(getValue() ?? {}).map(
            ([key, value]) =>
              value &&
              SIGNAL_CONFIG[key] && (
                <Badge
                  key={key}
                  variant={SIGNAL_CONFIG[key].variant}
                  className='text-2xs'
                >
                  {SIGNAL_CONFIG[key].label}
                </Badge>
              )
          )}
        </div>
      ),
      size: 220,
    }) as ColumnDef<ReviewLead, unknown>,
    reviewQueueColumnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: context => renderActionsCell(context, skippingIds, handleSkip),
      size: 110,
    }) as ColumnDef<ReviewLead, unknown>,
  ];
}

export function ReviewQueuePanel() {
  const [leads, setLeads] = useState<ReviewLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skippingIds, setSkippingIds] = useState<Set<string>>(() => new Set());
  const limit = 50;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        queue: 'manual_review',
        sort: 'priorityScore',
        sortOrder: 'desc',
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/outreach?${params}`);
      if (!res.ok) {
        throw new Error('Failed to load review queue');
      }
      const data = (await res.json()) as ReviewQueueResponse;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      setLeads([]);
      setTotal(0);
      setLoadError(
        'We could not load the manual review queue right now. Please try again shortly.'
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleSkip = useCallback(
    async (id: string) => {
      setSkippingIds(current => new Set(current).add(id));
      try {
        const res = await fetch(`/api/admin/leads/${id}/skip`, {
          method: 'PATCH',
        });
        if (!res.ok) {
          throw new Error('Failed to skip lead');
        }
        toast.success('Lead skipped');
        await fetchQueue();
      } catch {
        toast.error('Failed to skip lead');
      } finally {
        setSkippingIds(current => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchQueue]
  );

  const columns = useMemo(
    () => createReviewQueueColumns(handleSkip, skippingIds),
    [handleSkip, skippingIds]
  );

  const totalPages = Math.ceil(total / limit);
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
    <div className='flex flex-col gap-4'>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title='Manual review'
          subtitle='Leads requiring a human pass before outreach continues.'
          actions={
            <span className='text-xs font-semibold tabular-nums text-secondary-token'>
              {total} queued
            </span>
          }
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actionsClassName='shrink-0'
        />

        <AdminDataTable
          data={leads}
          columns={columns}
          isLoading={loading}
          getRowId={lead => lead.id}
          enableVirtualization={false}
          minWidth='980px'
          emptyState={
            <TableEmptyState
              title={
                loadError ? 'Unable to load manual review' : 'No leads pending'
              }
              description={loadError ?? 'No leads pending review'}
            />
          }
        />

        {totalPages > 1 && (
          <div className='border-t border-subtle px-(--linear-app-content-padding-x) py-2'>
            <AdminTablePagination
              page={page}
              totalPages={totalPages}
              from={(page - 1) * limit + 1}
              to={Math.min(page * limit, total)}
              total={total}
              canPrev={hasPreviousPage && !loading}
              canNext={hasNextPage && !loading}
              onPrevClick={() => setPage(current => Math.max(1, current - 1))}
              onNextClick={() =>
                setPage(current => Math.min(totalPages, current + 1))
              }
              entityLabel='leads'
            />
          </div>
        )}
      </ContentSurfaceCard>
    </div>
  );
}
