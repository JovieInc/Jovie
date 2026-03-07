'use client';

import { AlertTriangle, Mail, MessageCircle, Send } from 'lucide-react';
import { KpiItem } from '@/components/admin/KpiItem';

interface OutreachKpisProps {
  readonly counts: {
    email: number;
    dm: number;
    manualReview: number;
    total: number;
  };
}

export function OutreachKpis({ counts }: OutreachKpisProps) {
  return (
    <section className='space-y-3'>
      <h2 className='text-sm font-semibold text-primary-token'>
        Outreach Pipeline
      </h2>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <KpiItem
          title='TOTAL QUEUED'
          value={String(counts.total)}
          metadata={<span>Across all queues</span>}
          icon={Send}
        />
        <KpiItem
          title='EMAIL QUEUE'
          value={String(counts.email)}
          metadata={<span>Ready for email outreach</span>}
          icon={Mail}
        />
        <KpiItem
          title='DM QUEUE'
          value={String(counts.dm)}
          metadata={<span>Ready for DM outreach</span>}
          icon={MessageCircle}
        />
        <KpiItem
          title='MANUAL REVIEW'
          value={String(counts.manualReview)}
          metadata={<span>Needs human review</span>}
          icon={AlertTriangle}
          iconClassName='text-amber-500'
        />
      </div>
    </section>
  );
}
