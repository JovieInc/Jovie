'use client';

import { AlertTriangle, Mail, MessageCircle, Send } from 'lucide-react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { KpiItem } from '@/features/admin/KpiItem';

interface OutreachKpisProps {
  readonly counts: {
    email: number;
    dm: number;
    manualReview: number;
    total: number;
  };
  readonly embedded?: boolean;
}

export function OutreachKpis({ counts, embedded = false }: OutreachKpisProps) {
  const kpiGrid = (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      <KpiItem
        title='Total Queued'
        value={String(counts.total)}
        metadata={<span>Across all queues</span>}
        icon={Send}
      />
      <KpiItem
        title='Email Queue'
        value={String(counts.email)}
        metadata={<span>Ready for email outreach</span>}
        icon={Mail}
      />
      <KpiItem
        title='DM Queue'
        value={String(counts.dm)}
        metadata={<span>Ready for DM outreach</span>}
        icon={MessageCircle}
      />
      <KpiItem
        title='Manual Review'
        value={String(counts.manualReview)}
        metadata={<span>Needs human review</span>}
        icon={AlertTriangle}
        iconClassName='text-warning'
      />
    </div>
  );

  if (embedded) {
    return kpiGrid;
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Outreach Pipeline'
        subtitle='Across email, DM, and manual-review queues'
        actions={
          <span className='text-xs font-semibold tabular-nums text-secondary-token'>
            {counts.total} total
          </span>
        }
        className='min-h-0 px-app-header py-3'
        actionsClassName='shrink-0'
      />
      <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        {kpiGrid}
      </div>
    </ContentSurfaceCard>
  );
}
