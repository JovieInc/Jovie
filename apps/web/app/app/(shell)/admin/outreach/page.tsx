'use client';

import { useCallback, useEffect, useState } from 'react';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { OutreachKpis } from '@/features/admin/outreach/OutreachKpis';

interface QueueResponse {
  items: unknown[];
  total: number;
}

export default function AdminOutreachPage() {
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
      const [emailRes, dmRes, reviewRes] = await Promise.all([
        fetch('/api/admin/outreach?queue=email&limit=1'),
        fetch('/api/admin/outreach?queue=dm&limit=1'),
        fetch('/api/admin/outreach?queue=manual_review&limit=1'),
      ]);

      if (!emailRes.ok || !dmRes.ok || !reviewRes.ok) {
        throw new Error('Failed to fetch queue counts');
      }

      const [emailData, dmData, reviewData] = (await Promise.all([
        emailRes.json(),
        dmRes.json(),
        reviewRes.json(),
      ])) as [QueueResponse, QueueResponse, QueueResponse];

      const email = emailData.total ?? 0;
      const dm = dmData.total ?? 0;
      const manualReview = reviewData.total ?? 0;

      setCounts({
        email,
        dm,
        manualReview,
        total: email + dm + manualReview,
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
    return (
      <ContentSurfaceCard className='overflow-hidden' aria-hidden='true'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-36'
          descriptionWidth='w-56'
          actionWidths={['w-16']}
          className='min-h-0 px-4 py-3 sm:px-5'
        />
        <div className='grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4'>
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
        <ContentSurfaceCard className='px-4 py-3 text-[13px] leading-[18px] text-(--linear-text-secondary)'>
          <p>{loadError}</p>
        </ContentSurfaceCard>
      )}
      <OutreachKpis counts={counts} />
    </div>
  );
}
