'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OutreachStatusBadge } from '@/components/admin/outreach/OutreachStatusBadge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

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

function renderEmailRows(
  loading: boolean,
  leads: EmailQueueLead[],
  renderRow: (lead: EmailQueueLead) => ReactNode
): ReactNode {
  if (loading) {
    return (
      <tr>
        <td colSpan={6} className='py-8 text-center text-secondary-token'>
          <LoadingSpinner size='sm' tone='muted' className='mx-auto' />
        </td>
      </tr>
    );
  }
  if (leads.length === 0) {
    return (
      <tr>
        <td colSpan={6} className='py-8 text-center text-secondary-token'>
          No leads in email queue
        </td>
      </tr>
    );
  }
  return leads.map(renderRow);
}

export default function AdminOutreachEmailPage() {
  const [leads, setLeads] = useState<EmailQueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
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
      toast.error('Failed to load email queue');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className='flex flex-col gap-6'>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title={`Email Queue (${total})`}
          className='min-h-0 px-4 py-3 sm:px-6'
        />

        <div className='overflow-x-auto px-4 py-4 sm:px-6'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b border-(--linear-border-subtle) text-left text-secondary-token'>
                <th className='pb-2 pr-3 font-medium'>Name</th>
                <th className='pb-2 pr-3 font-medium'>Priority</th>
                <th className='pb-2 pr-3 font-medium'>Fit Score</th>
                <th className='pb-2 pr-3 font-medium'>Email</th>
                <th className='pb-2 pr-3 font-medium'>Status</th>
                <th className='pb-2 font-medium'>Queued At</th>
              </tr>
            </thead>
            <tbody>
              {renderEmailRows(loading, leads, lead => (
                <tr
                  key={lead.id}
                  className='border-b border-(--linear-border-subtle) transition-colors hover:bg-(--linear-bg-surface-0)'
                >
                  <td className='py-2.5 pr-3'>
                    <span className='font-medium text-primary-token'>
                      {lead.displayName || '-'}
                    </span>
                  </td>
                  <td className='py-2.5 pr-3 tabular-nums'>
                    {lead.priorityScore ?? '-'}
                  </td>
                  <td className='py-2.5 pr-3 tabular-nums'>
                    {lead.fitScore ?? '-'}
                  </td>
                  <td className='py-2.5 pr-3'>
                    <span className='text-secondary-token'>
                      {lead.contactEmail || '-'}
                    </span>
                  </td>
                  <td className='py-2.5 pr-3'>
                    <OutreachStatusBadge status={lead.outreachStatus} />
                  </td>
                  <td className='py-2.5 text-secondary-token'>
                    {lead.outreachQueuedAt
                      ? new Date(lead.outreachQueuedAt).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className='flex items-center justify-between border-t border-(--linear-border-subtle) px-4 py-3 sm:px-6'>
            <span className='text-xs text-secondary-token'>
              Page {page} of {totalPages}
            </span>
            <div className='flex gap-1'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className='h-8 rounded-[8px] border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
              >
                <ChevronLeft className='size-4' />
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className='h-8 rounded-[8px] border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
              >
                <ChevronRight className='size-4' />
              </Button>
            </div>
          </div>
        )}
      </ContentSurfaceCard>
    </div>
  );
}
