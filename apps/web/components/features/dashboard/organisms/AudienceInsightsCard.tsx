'use client';

import { MessageCircle, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { useInsightsQuery, useUpdateInsightMutation } from '@/lib/queries';
import type { InsightCategory, InsightResponse } from '@/types/insights';
import { InsightCategoryIcon } from '../insights/InsightCategoryIcon';

/** Categories that surface in the audience sidebar */
const AUDIENCE_CATEGORIES: InsightCategory[] = [
  'geographic',
  'growth',
  'content',
  'platform',
  'engagement',
];

function InsightRow({ insight }: { readonly insight: InsightResponse }) {
  const router = useRouter();
  const { mutate: updateInsight } = useUpdateInsightMutation();

  return (
    <li className='group flex items-start gap-2 rounded-[8px] border border-transparent px-2 py-1.5 transition-[background-color,border-color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0'>
      <InsightCategoryIcon category={insight.category} size='sm' />
      <div className='min-w-0 flex-1'>
        <p className='line-clamp-2 text-[12px] leading-snug text-secondary-token'>
          <span className='font-[510] text-primary-token'>{insight.title}</span>
          {insight.actionSuggestion ? ` · ${insight.actionSuggestion}` : null}
        </p>
        <button
          type='button'
          className='mt-1 inline-flex items-center gap-1 text-[10.5px] font-[510] text-accent transition-colors hover:text-accent/80'
          onClick={() => {
            const q = encodeURIComponent(
              `Tell me more about: ${insight.title}`
            );
            router.push(`${APP_ROUTES.CHAT}?q=${q}`);
          }}
        >
          <MessageCircle className='h-3 w-3' />
          Ask Jovie
        </button>
      </div>
      <button
        type='button'
        aria-label='Dismiss insight'
        className='shrink-0 rounded-md p-0.5 text-tertiary-token opacity-0 transition-opacity hover:text-secondary-token group-hover:opacity-100'
        onClick={() =>
          updateInsight({ insightId: insight.id, status: 'dismissed' })
        }
      >
        <X className='h-3 w-3' />
      </button>
    </li>
  );
}

function CardSkeleton() {
  return (
    <DrawerSurfaceCard className='space-y-2 p-3'>
      <div className='flex items-center gap-1.5'>
        <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
        <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
      </div>
      <div className='space-y-1.5'>
        <LoadingSkeleton height='h-3' width='w-full' rounded='sm' />
        <LoadingSkeleton height='h-3' width='w-3/4' rounded='sm' />
      </div>
    </DrawerSurfaceCard>
  );
}

/**
 * Compact insights card for the audience analytics sidebar.
 * Shows top 3 audience-relevant AI signals with "Ask Jovie" drill-down.
 */
export function AudienceInsightsCard() {
  const { data, isLoading } = useInsightsQuery({
    category: AUDIENCE_CATEGORIES,
    limit: 3,
  });

  if (isLoading) return <CardSkeleton />;

  const insights = data?.insights ?? [];
  const total = data?.total ?? 0;

  if (total === 0) return null;

  return (
    <DrawerSurfaceCard className='overflow-hidden py-2'>
      {/* Header */}
      <div className='flex items-center gap-1.5 px-3 py-1'>
        <Sparkles className='h-3.5 w-3.5 text-secondary-token' />
        <span className='text-[13px] font-[510] text-primary-token'>
          Signals
        </span>
        <span className='inline-flex min-w-[18px] items-center justify-center rounded-[6px] border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-[10px] font-[510] leading-none text-secondary-token tabular-nums'>
          {total}
        </span>
      </div>

      {/* Insight list */}
      <ul className='space-y-0.5 px-1'>
        {insights.map(insight => (
          <InsightRow key={insight.id} insight={insight} />
        ))}
      </ul>
    </DrawerSurfaceCard>
  );
}
