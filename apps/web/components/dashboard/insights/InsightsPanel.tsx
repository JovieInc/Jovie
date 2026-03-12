'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useGenerateInsightsMutation } from '@/lib/queries/useInsightsMutation';
import { useInsightsQuery } from '@/lib/queries/useInsightsQuery';
import type { InsightCategory, InsightResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';
import { InsightEmptyState } from './InsightEmptyState';

function getSubtitle(total: number): string {
  if (total <= 0) return 'AI-powered analytics recommendations';
  return `${total} active insight${total === 1 ? '' : 's'}`;
}

interface PrioritySectionProps {
  readonly label: string;
  readonly colorClass: string;
  readonly insights: InsightResponse[];
}

function PrioritySection({
  label,
  colorClass,
  insights,
}: PrioritySectionProps) {
  if (insights.length === 0) return null;
  return (
    <section>
      <h3
        className={`mb-3 text-[11px] font-[510] uppercase tracking-[0.08em] ${colorClass}`}
      >
        {label}
      </h3>
      <div className='space-y-3'>
        {insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

interface InsightsPanelContentProps {
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly insights: InsightResponse[];
  readonly grouped: {
    high: InsightResponse[];
    medium: InsightResponse[];
    low: InsightResponse[];
  };
}

function InsightsPanelContent({
  isLoading,
  error,
  insights,
  grouped,
}: InsightsPanelContentProps) {
  if (isLoading) {
    return (
      <div className='space-y-3' aria-hidden='true'>
        {['high', 'medium', 'low'].map(key => (
          <ContentSurfaceCard
            key={key}
            className='flex items-start gap-3 p-4 sm:p-5'
          >
            <div className='h-8 w-8 rounded-lg skeleton motion-reduce:animate-none' />
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='h-4 w-40 rounded-sm skeleton motion-reduce:animate-none' />
              <div className='h-3 w-full rounded-sm skeleton motion-reduce:animate-none' />
              <div className='h-3 w-4/5 rounded-sm skeleton motion-reduce:animate-none' />
            </div>
          </ContentSurfaceCard>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ContentSurfaceCard className='p-6 text-center'>
        <p className='text-[13px] text-secondary-token'>
          Failed to load insights. Please try again.
        </p>
      </ContentSurfaceCard>
    );
  }

  if (insights.length === 0) {
    return <InsightEmptyState />;
  }

  return (
    <div className='space-y-6'>
      <PrioritySection
        label='High Priority'
        colorClass='text-orange-600 dark:text-orange-400'
        insights={grouped.high}
      />
      <PrioritySection
        label='Recommended'
        colorClass='text-blue-600 dark:text-blue-400'
        insights={grouped.medium}
      />
      <PrioritySection
        label='Informational'
        colorClass='text-tertiary-token'
        insights={grouped.low}
      />
    </div>
  );
}

const CATEGORY_FILTERS: { label: string; value: InsightCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Geographic', value: 'geographic' },
  { label: 'Growth', value: 'growth' },
  { label: 'Content', value: 'content' },
  { label: 'Revenue', value: 'revenue' },
  { label: 'Tour', value: 'tour' },
  { label: 'Platform', value: 'platform' },
  { label: 'Engagement', value: 'engagement' },
  { label: 'Timing', value: 'timing' },
];

export function InsightsPanel() {
  const [selectedCategory, setSelectedCategory] = useState<
    InsightCategory | 'all'
  >('all');

  const categoryFilter = useMemo(
    () => (selectedCategory === 'all' ? undefined : [selectedCategory]),
    [selectedCategory]
  );

  const { data, isLoading, error } = useInsightsQuery({
    category: categoryFilter,
    limit: 50,
  });

  const { mutate: generate, isPending: isGenerating } =
    useGenerateInsightsMutation();

  const insights = useMemo(() => data?.insights ?? [], [data?.insights]);
  const total = data?.total ?? 0;

  // Group insights by priority
  const grouped = useMemo(() => {
    const high = insights.filter(i => i.priority === 'high');
    const medium = insights.filter(i => i.priority === 'medium');
    const low = insights.filter(i => i.priority === 'low');
    return { high, medium, low };
  }, [insights]);

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='space-y-0.5'>
          <h2 className='text-lg font-[590] text-primary-token'>AI Insights</h2>
          <p className='text-[13px] text-secondary-token'>
            {getSubtitle(total)}
          </p>
        </div>

        <Button
          variant='secondary'
          size='sm'
          disabled={isGenerating}
          onClick={() => generate()}
          className='h-8 gap-2 px-3'
        >
          <Icon
            name={isGenerating ? 'Loader2' : 'Sparkles'}
            className={
              isGenerating ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
            }
          />
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </div>

      {/* Category filter pills */}
      <div
        className='flex flex-wrap gap-1.5'
        role='toolbar'
        aria-label='Filter insights by category'
      >
        {CATEGORY_FILTERS.map(filter => (
          <button
            key={filter.value}
            type='button'
            onClick={() => setSelectedCategory(filter.value)}
            aria-pressed={selectedCategory === filter.value}
            className={`rounded-[8px] border px-3 py-1 text-[12.5px] font-[510] tracking-[-0.01em] transition-[background-color,color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 ${
              selectedCategory === filter.value
                ? 'border-(--linear-border-default) bg-(--linear-bg-surface-0) text-(--linear-text-primary)'
                : 'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary)'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <InsightsPanelContent
        isLoading={isLoading}
        error={error}
        insights={insights}
        grouped={grouped}
      />
    </div>
  );
}
