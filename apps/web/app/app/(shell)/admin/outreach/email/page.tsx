'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { OutreachStatusBadge } from '@/features/admin/outreach/OutreachStatusBadge';
import { AdminTablePagination } from '@/features/admin/table/AdminTablePagination';
import { cn } from '@/lib/utils';

interface EmailQueueLead {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  priorityScore: number | null;
  fitScore: number | null;
  outreachStatus: string;
  outreachQueuedAt: string | null;
}

interface EmailQueueResponse {
  items: EmailQueueLead[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminOutreachEmailPage() {
  const [leads, setLeads] = useState<EmailQueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const limit = 50;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        queue: 'email',
        sort: 'priorityScore',
        sortOrder: 'desc',
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/outreach?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load email queue');
      const data = (await res.json()) as EmailQueueResponse;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      setLeads([]);
      setTotal(0);
      setLoadError(
        'We could not load the email queue right now. Please try again shortly.'
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const totalPages = Math.ceil(total / limit);
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
    <div className='flex flex-col gap-4'>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title='Email Queue'
          subtitle='Highest-priority leads queued for email outreach'
          actions={
            <span className='text-[12px] font-[560] tabular-nums text-secondary-token'>
              {total} queued
            </span>
          }
          className='min-h-0 px-4 py-3 sm:px-6'
          actionsClassName='shrink-0'
        />

        <ContentTable>
          <thead>
            <tr className={CONTENT_TABLE_HEAD_ROW_CLASS}>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Name</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Priority</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Fit Score</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Email</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Status</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Queued At</th>
            </tr>
          </thead>
          <tbody>
            {loading || leads.length === 0 ? (
              <ContentTableStateRow
                colSpan={6}
                isLoading={loading}
                emptyMessage={loadError ?? 'No leads in email queue'}
                loadingLabel='Loading email queue'
              />
            ) : (
              leads.map(lead => (
                <tr key={lead.id} className={CONTENT_TABLE_ROW_CLASS}>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <span className='font-[560] text-primary-token'>
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
                    <OutreachStatusBadge status={lead.outreachStatus} />
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <span className='text-secondary-token'>
                      {lead.outreachQueuedAt
                        ? new Date(lead.outreachQueuedAt).toLocaleDateString()
                        : '-'}
                    </span>
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
              onPrevClick={() => setPage(p => Math.max(1, p - 1))}
              onNextClick={() => setPage(p => Math.min(totalPages, p + 1))}
              entityLabel='leads'
            />
          </div>
        )}
      </ContentSurfaceCard>
    </div>
  );
}
