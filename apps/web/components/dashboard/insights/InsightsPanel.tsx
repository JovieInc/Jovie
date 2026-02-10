'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useGenerateInsightsMutation } from '@/lib/queries/useInsightsMutation';
import { useInsightsQuery } from '@/lib/queries/useInsightsQuery';
import type { InsightCategory } from '@/types/insights';
import { InsightCard } from './InsightCard';
import { InsightEmptyState } from './InsightEmptyState';

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
          <p className='text-xs text-secondary-token'>
            {total > 0
              ? `${total} active insight${total === 1 ? '' : 's'}`
              : 'AI-powered analytics recommendations'}
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

      {/* Loading state */}
      {isLoading ? (
        <div className='flex items-center justify-center py-12'>
          <Icon
            name='Loader2'
            className='h-5 w-5 animate-spin text-tertiary-token'
          />
        </div>
      ) : error ? (
        <div className='rounded-xl border border-subtle bg-surface-1 p-6 text-center'>
          <p className='text-sm text-secondary-token'>
            Failed to load insights. Please try again.
          </p>
        </div>
      ) : insights.length === 0 ? (
        <InsightEmptyState />
      ) : (
        <div className='space-y-6'>
          {/* High priority */}
          {grouped.high.length > 0 ? (
            <section>
              <h3 className='mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400'>
                High Priority
              </h3>
              <div className='space-y-3'>
                {grouped.high.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Medium priority */}
          {grouped.medium.length > 0 ? (
            <section>
              <h3 className='mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400'>
                Recommended
              </h3>
              <div className='space-y-3'>
                {grouped.medium.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Low priority */}
          {grouped.low.length > 0 ? (
            <section>
              <h3 className='mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
                Informational
              </h3>
              <div className='space-y-3'>
                {grouped.low.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
