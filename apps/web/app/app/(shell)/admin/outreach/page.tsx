'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OutreachKpis } from '@/components/admin/outreach/OutreachKpis';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

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

  const fetchCounts = useCallback(async () => {
    setLoading(true);
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
      toast.error('Failed to load outreach counts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-16'>
        <LoadingSpinner size='md' tone='muted' />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6 p-4 sm:p-6'>
      <OutreachKpis counts={counts} />
    </div>
  );
}
