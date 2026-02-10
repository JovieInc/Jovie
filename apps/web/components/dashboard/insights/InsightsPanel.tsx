'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
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
        className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] ${colorClass}`}
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
      <div className='flex items-center justify-center py-12'>
        <Icon
          name='Loader2'
          className='h-5 w-5 animate-spin text-tertiary-token'
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 text-center'>
        <p className='text-sm text-secondary-token'>
          Failed to load insights. Please try again.
        </p>
      </div>
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

  const insights = data?.insights ?? [];
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
          <h2 className='text-lg font-semibold text-primary-token'>
            AI Insights
          </h2>
          <p className='text-xs text-secondary-token'>{getSubtitle(total)}</p>
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
      <div className='flex flex-wrap gap-1.5'>
        {CATEGORY_FILTERS.map(filter => (
          <button
            key={filter.value}
            type='button'
            onClick={() => setSelectedCategory(filter.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategory === filter.value
                ? 'bg-accent-token text-white'
                : 'bg-surface-2 text-secondary-token hover:text-primary-token'
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
