'use client';

import { Button, Input, Switch } from '@jovie/ui';
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
import { AdminTablePagination } from '@/features/admin/table/AdminTablePagination';
import { cn } from '@/lib/utils';
import { OutreachStatusBadge } from './OutreachStatusBadge';

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
  pendingTotal: number;
  page: number;
  limit: number;
}

interface QueueOutreachResponse {
  ok: boolean;
  attempted: number;
  queued: number;
  failed: number;
  remainingPending: number;
}

interface QueueOutreachErrorResponse {
  error?: string;
}

export function EmailQueuePanel() {
  const [leads, setLeads] = useState<EmailQueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueLimit, setQueueLimit] = useState('10');
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [campaignsEnabled, setCampaignsEnabled] = useState(true);
  const [togglingCampaigns, setTogglingCampaigns] = useState(false);
  const limit = 50;

  const fetchCampaignSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/outreach/settings');
      if (res.ok) {
        const data = (await res.json()) as { campaignsEnabled: boolean };
        setCampaignsEnabled(data.campaignsEnabled);
      }
    } catch {
      // Keep default optimistic state if the settings endpoint is unavailable.
    }
  }, []);

  const toggleCampaignsEnabled = useCallback(async (enabled: boolean) => {
    setTogglingCampaigns(true);
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignsEnabled: enabled }),
      });
      if (res.ok) {
        setCampaignsEnabled(enabled);
      }
    } catch {
      setCampaignsEnabled(!enabled);
    } finally {
      setTogglingCampaigns(false);
    }
  }, []);

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
      const res = await fetch(`/api/admin/outreach?${params}`);
      if (!res.ok) {
        throw new Error('Failed to load email queue');
      }
      const data = (await res.json()) as EmailQueueResponse;
      setLeads(data.items);
      setTotal(data.total);
      setPendingTotal(data.pendingTotal);
    } catch {
      setLeads([]);
      setTotal(0);
      setPendingTotal(0);
      setLoadError(
        'We could not load the email queue right now. Please try again shortly.'
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchQueue();
    fetchCampaignSettings();
  }, [fetchCampaignSettings, fetchQueue]);

  const queuePendingEmails = useCallback(async () => {
    const parsedLimit = Number.parseInt(queueLimit, 10);
    const safeLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 100)
        : 10;

    setQueueing(true);
    setQueueMessage(null);
    setQueueError(null);

    try {
      const response = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: safeLimit }),
      });

      const rawData = (await response.json()) as
        | QueueOutreachResponse
        | QueueOutreachErrorResponse;

      if (!response.ok) {
        throw new Error(
          (rawData as QueueOutreachErrorResponse).error ??
            'Failed to queue outreach emails'
        );
      }

      const data = rawData as QueueOutreachResponse;

      setQueueMessage(
        `Queued ${data.queued} lead${data.queued === 1 ? '' : 's'} for outreach. ${data.remainingPending} still pending.`
      );
      await fetchQueue();
    } catch (error) {
      setQueueError(
        error instanceof Error
          ? error.message
          : 'Failed to queue outreach emails'
      );
    } finally {
      setQueueing(false);
    }
  }, [fetchQueue, queueLimit]);

  const totalPages = Math.ceil(total / limit);
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
    <div className='flex flex-col gap-4'>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title='Campaign emails'
          subtitle={
            campaignsEnabled
              ? 'Outreach emails and drip campaigns are active'
              : 'All outreach emails and drip campaigns are paused'
          }
          actions={
            <Switch
              checked={campaignsEnabled}
              onCheckedChange={toggleCampaignsEnabled}
              disabled={togglingCampaigns}
              aria-label='Toggle campaign emails'
            />
          }
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actionsClassName='shrink-0'
        />
      </ContentSurfaceCard>

      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          title='Email queue'
          subtitle='Approve leads first, then explicitly queue the next batch when you are ready to send.'
          actions={
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                min={1}
                max={100}
                value={queueLimit}
                onChange={event => setQueueLimit(event.target.value)}
                disabled={queueing}
                className='h-8 w-20'
                aria-label='Queue outreach count'
              />
              <Button
                size='sm'
                onClick={() => {
                  queuePendingEmails();
                }}
                disabled={queueing || loading || pendingTotal === 0}
              >
                {queueing ? 'Queueing...' : 'Queue Next Batch'}
              </Button>
              <span className='text-[12px] font-semibold tabular-nums text-secondary-token'>
                {pendingTotal} pending
              </span>
            </div>
          }
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actionsClassName='shrink-0'
        />

        {(queueMessage || queueError) && (
          <div className='border-b border-subtle px-(--linear-app-content-padding-x) py-3 text-sm'>
            <p
              className={cn(
                'font-medium',
                queueError ? 'text-destructive' : 'text-success'
              )}
            >
              {queueError ?? queueMessage}
            </p>
          </div>
        )}

        <ContentTable>
          <thead>
            <tr className={CONTENT_TABLE_HEAD_ROW_CLASS}>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Name</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Priority</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Fit</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Email</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Queued</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading || leads.length === 0 ? (
              <ContentTableStateRow
                colSpan={6}
                isLoading={loading}
                emptyMessage={
                  loadError ?? 'No leads are queued for email right now.'
                }
                loadingLabel='Loading email queue'
              />
            ) : (
              leads.map(lead => (
                <tr key={lead.id} className={CONTENT_TABLE_ROW_CLASS}>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <span className='font-semibold text-primary-token'>
                      {lead.displayName || 'Unknown creator'}
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
                    <span className='text-secondary-token'>
                      {lead.outreachQueuedAt
                        ? new Date(lead.outreachQueuedAt).toLocaleString()
                        : 'Not queued'}
                    </span>
                  </td>
                  <td className={CONTENT_TABLE_CELL_CLASS}>
                    <OutreachStatusBadge status={lead.outreachStatus} />
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
