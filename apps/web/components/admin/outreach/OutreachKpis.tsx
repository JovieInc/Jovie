'use client';

import { AlertTriangle, Mail, MessageCircle, Send } from 'lucide-react';
import { KpiItem } from '@/components/admin/KpiItem';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

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
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Outreach Pipeline'
        subtitle='Across email, DM, and manual-review queues'
        actions={
          <span className='text-[12px] font-[560] tabular-nums text-(--linear-text-secondary)'>
            {counts.total} total
          </span>
        }
        className='min-h-0 px-4 py-3 sm:px-5'
        actionsClassName='shrink-0'
      />
      <div className='grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4'>
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
          iconClassName='text-warning'
        />
      </div>
    </ContentSurfaceCard>
  );
}
