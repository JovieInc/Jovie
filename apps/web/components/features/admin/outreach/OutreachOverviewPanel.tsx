'use client';

import { useCallback, useEffect, useState } from 'react';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { OutreachKpis } from './OutreachKpis';

interface OutreachCountsResponse {
  counts?: {
    email?: number;
    dm?: number;
    manualReview?: number;
    total?: number;
  };
}

interface OutreachOverviewPanelProps {
  readonly embedded?: boolean;
}

export function OutreachOverviewPanel({
  embedded = false,
}: Readonly<OutreachOverviewPanelProps> = {}) {
  const [counts, setCounts] = useState({
    email: 0,
    dm: 0,
    manualReview: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/outreach?counts=1');

      if (!res.ok) {
        throw new Error('Failed to fetch queue counts');
      }

      const data = (await res.json()) as OutreachCountsResponse;

      const email = data.counts?.email ?? 0;
      const dm = data.counts?.dm ?? 0;
      const manualReview = data.counts?.manualReview ?? 0;

      setCounts({
        email,
        dm,
        manualReview,
        total: data.counts?.total ?? email + dm + manualReview,
      });
    } catch {
      setCounts({ email: 0, dm: 0, manualReview: 0, total: 0 });
      setLoadError(
        'We could not load outreach counts right now. Please try again shortly.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  if (loading) {
    if (embedded) {
      return (
        <div
          className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
          aria-hidden='true'
        >
          {['total', 'email', 'dm', 'review'].map(key => (
            <ContentMetricCardSkeleton key={key} />
          ))}
        </div>
      );
    }

    return (
      <ContentSurfaceCard className='overflow-hidden' aria-hidden='true'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-36'
          descriptionWidth='w-56'
          actionWidths={['w-16']}
          className='min-h-0 px-app-header py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-4'>
          {['total', 'email', 'dm', 'review'].map(key => (
            <ContentMetricCardSkeleton key={key} />
          ))}
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {loadError && (
        <p className='text-app leading-[18px] text-secondary-token'>
          {loadError}
        </p>
      )}
      <OutreachKpis counts={counts} embedded={embedded} />
    </div>
  );
}
