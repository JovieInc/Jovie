'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DmQueueCard } from './DmQueueCard';

interface DmQueueLead {
  id: string;
  displayName: string | null;
  instagramHandle: string | null;
  priorityScore: number | null;
  dmCopy: string | null;
  outreachStatus: string;
}

interface DmQueueResponse {
  items: DmQueueLead[];
  total: number;
}

function DmQueueBody({
  loading,
  leads,
  fetchQueue,
}: {
  readonly loading: boolean;
  readonly leads: DmQueueLead[];
  readonly fetchQueue: () => void;
}) {
  if (loading) {
    return (
      <div className='flex items-center justify-center py-16'>
        <LoadingSpinner size='md' tone='muted' />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <p className='py-8 text-center text-sm text-secondary-token'>
        No leads in DM queue
      </p>
    );
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
      {leads.map(lead => (
        <DmQueueCard
          key={lead.id}
          lead={lead}
          onMarkedSent={() => fetchQueue()}
        />
      ))}
    </div>
  );
}

export function DmQueuePanel() {
  const [leads, setLeads] = useState<DmQueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        queue: 'dm',
        sort: 'priorityScore',
        sortOrder: 'desc',
        limit: '50',
      });
      const res = await fetch(`/api/admin/outreach?${params}`);
      if (!res.ok) {
        throw new Error('Failed to load DM queue');
      }
      const data = (await res.json()) as DmQueueResponse;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      toast.error('Failed to load DM queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='DM queue'
        subtitle='Copy the prepared message, send it manually, and mark each lead as completed.'
        actions={
          <span className='text-[12px] font-semibold tabular-nums text-secondary-token'>
            {total} queued
          </span>
        }
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        actionsClassName='shrink-0'
      />
      <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        <DmQueueBody loading={loading} leads={leads} fetchQueue={fetchQueue} />
      </div>
    </ContentSurfaceCard>
  );
}
