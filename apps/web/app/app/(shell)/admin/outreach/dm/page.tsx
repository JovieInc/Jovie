'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DmQueueCard } from '@/components/admin/outreach/DmQueueCard';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

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

export default function AdminOutreachDmPage() {
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
      const res = await fetch(`/api/admin/outreach?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load DM queue');
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
    <div className='flex flex-col gap-6 p-4 sm:p-6'>
      <h2 className='text-sm font-semibold text-primary-token'>
        DM Queue ({total})
      </h2>

      <DmQueueBody loading={loading} leads={leads} fetchQueue={fetchQueue} />
    </div>
  );
}
