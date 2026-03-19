'use client';

import { Sparkles } from 'lucide-react';
import { memo } from 'react';
import { useInsightsSummaryQuery } from '@/lib/queries';

interface InsightOneLinerProps {
  readonly displayName?: string;
}

export const InsightOneLiner = memo(function InsightOneLiner({
  displayName,
}: InsightOneLinerProps) {
  const { data } = useInsightsSummaryQuery({ enabled: true });
  const topInsight = data?.insights?.[0];

  const text =
    topInsight?.title ??
    `Welcome${displayName ? `, ${displayName}` : ''} — your music hub`;

  return (
    <div className='flex items-start gap-2 py-2'>
      {topInsight && (
        <Sparkles className='mt-0.5 h-4 w-4 shrink-0 text-accent' />
      )}
      <p className='text-lg font-semibold tracking-tight text-primary-token'>
        {text}
      </p>
    </div>
  );
});
