'use client';

import { Badge } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  CONTENT_TABLE_CELL_CLASS,
  CONTENT_TABLE_FOOTER_CLASS,
  CONTENT_TABLE_HEAD_CELL_CLASS,
  CONTENT_TABLE_HEAD_ROW_CLASS,
  CONTENT_TABLE_ROW_CLASS,
  ContentTable,
  ContentTableStateRow,
} from '@/components/molecules/ContentTable';
import { DrawerButton } from '@/components/molecules/drawer';
import { AdminTablePagination } from '@/features/admin/table/AdminTablePagination';
import { cn } from '@/lib/utils';

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

export function ReviewQueuePanel() {
  const [leads, setLeads] = useState<ReviewLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
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

  async function handleSkip(id: string) {
    setSkippingId(id);
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
      setSkippingId(null);
    }
  }

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
            <span className='text-[12px] font-semibold tabular-nums text-secondary-token'>
              {total} queued
            </span>
          }
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actionsClassName='shrink-0'
        />

        <ContentTable>
          <thead>
            <tr className={CONTENT_TABLE_HEAD_ROW_CLASS}>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Name</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Priority</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Fit score</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Email</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Instagram</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Signals</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || leads.length === 0 ? (
              <ContentTableStateRow
                colSpan={7}
                isLoading={loading}
                emptyMessage={loadError ?? 'No leads pending review'}
                loadingLabel='Loading manual review queue'
              />
            ) : (
              leads.map(lead => (
                <tr key={lead.id} className={CONTENT_TABLE_ROW_CLASS}>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <span className='font-semibold text-primary-token'>
                      {lead.displayName || '-'}
                    </span>
                  </td>
                  <td className={cn(CONTENT_TABLE_CELL_CLASS, 'tabular-nums')}>
                    {lead.priorityScore ?? '-'}
                  </td>
                  <td className={cn(CONTENT_TABLE_CELL_CLASS, 'tabular-nums')}>
                    {lead.fitScore ?? '-'}
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <span className='text-secondary-token'>
                      {lead.contactEmail || '-'}
                    </span>
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    {lead.instagramHandle ? (
                      <a
                        href={`https://instagram.com/${lead.instagramHandle}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex items-center gap-1 text-secondary-token hover:text-primary-token'
                      >
                        @{lead.instagramHandle}
                        <ExternalLink className='size-3' aria-hidden='true' />
                      </a>
                    ) : (
                      <span className='text-tertiary-token'>-</span>
                    )}
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <div className='flex flex-wrap gap-1'>
                      {lead.signals &&
                        Object.entries(lead.signals).map(
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
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <DrawerButton
                      tone='secondary'
                      size='sm'
                      onClick={() => {
                        void handleSkip(lead.id);
                      }}
                      disabled={skippingId === lead.id}
                      className='h-8 px-3 text-[12px]'
                    >
                      {skippingId === lead.id ? (
                        <LoadingSpinner
                          size='sm'
                          tone='muted'
                          className='mr-1.5'
                        />
                      ) : null}
                      Skip
                    </DrawerButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </ContentTable>

        {totalPages > 1 && (
          <div className={CONTENT_TABLE_FOOTER_CLASS}>
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
