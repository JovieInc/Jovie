'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DmQueueCard,
  type DmQueueLead,
} from '@/components/admin/outreach/DmQueueCard';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

interface DmQueueResponse {
  items: DmQueueLead[];
  total: number;
}

const DAILY_STORAGE_KEY = 'jovie-dm-daily-count';
const SESSION_WARN_THRESHOLD = 15;
const SESSION_LIMIT_THRESHOLD = 20;

function getDailyCount(): number {
  try {
    const stored = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!stored) return 0;
    const { date, count } = JSON.parse(stored) as {
      date: string;
      count: number;
    };
    if (date !== new Date().toISOString().slice(0, 10)) return 0;
    return count;
  } catch {
    return 0;
  }
}

function incrementDailyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const current = getDailyCount();
  const next = current + 1;
  localStorage.setItem(
    DAILY_STORAGE_KEY,
    JSON.stringify({ date: today, count: next })
  );
  return next;
}

function SessionWarning({ sessionCount }: { readonly sessionCount: number }) {
  if (sessionCount >= SESSION_LIMIT_THRESHOLD) {
    return (
      <div className='rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive'>
        Session limit reached ({sessionCount} sent) — take a break to stay safe.
        Come back in a few hours.
      </div>
    );
  }
  if (sessionCount >= SESSION_WARN_THRESHOLD) {
    return (
      <div className='rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400'>
        Consider taking a break ({sessionCount} sent this session). Come back in
        a few hours.
      </div>
    );
  }
  return null;
}

function DmQueueBody({
  loading,
  leads,
  cardRefs,
  onMarkedSent,
  onSendDm,
}: {
  readonly loading: boolean;
  readonly leads: DmQueueLead[];
  readonly cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  readonly onMarkedSent: (leadId: string) => void;
  readonly onSendDm: (leadId: string, index: number) => void;
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
      {leads.map((lead, index) => (
        <div
          key={lead.id}
          ref={el => {
            if (el) {
              cardRefs.current.set(lead.id, el);
            } else {
              cardRefs.current.delete(lead.id);
            }
          }}
        >
          <DmQueueCard
            lead={lead}
            onMarkedSent={() => onMarkedSent(lead.id)}
            onSendDm={() => onSendDm(lead.id, index)}
          />
        </div>
      ))}
    </div>
  );
}

export default function AdminOutreachDmPage() {
  const [leads, setLeads] = useState<DmQueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionCount, setSessionCount] = useState(0);
  const [dailyCount, setDailyCount] = useState(0);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    setDailyCount(getDailyCount());
  }, []);

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

  function handleMarkedSent(leadId: string) {
    // Optimistic removal — no loading flash
    setLeads(prev => prev.filter(l => l.id !== leadId));
    setTotal(prev => prev - 1);
    setSessionCount(prev => prev + 1);
    setDailyCount(incrementDailyCount());
  }

  function handleSendDm(_leadId: string, index: number) {
    // Auto-scroll next card into view after a short delay
    const nextLead = leads[index + 1];
    if (nextLead) {
      setTimeout(() => {
        const el = cardRefs.current.get(nextLead.id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }

  return (
    <div className='flex flex-col gap-4 p-4 sm:p-6'>
      {/* Header with counters */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold text-primary-token'>
          DM Queue ({total})
        </h2>
        <div className='flex items-center gap-3 text-xs text-secondary-token'>
          <span className='rounded-md bg-surface-2 px-2 py-1 tabular-nums'>
            Session: {sessionCount}
          </span>
          <span className='rounded-md bg-surface-2 px-2 py-1 tabular-nums'>
            Today: {dailyCount}
          </span>
          <span
            className='cursor-help rounded-md bg-surface-2 px-2 py-1'
            title='Safe daily limit: ~40-50 cold DMs. Pace at ~1/minute. 2-3 sessions/day, 15-20 per session.'
          >
            Limit: ~40-50/day
          </span>
        </div>
      </div>

      <SessionWarning sessionCount={sessionCount} />

      <DmQueueBody
        loading={loading}
        leads={leads}
        cardRefs={cardRefs}
        onMarkedSent={handleMarkedSent}
        onSendDm={handleSendDm}
      />
    </div>
  );
}
