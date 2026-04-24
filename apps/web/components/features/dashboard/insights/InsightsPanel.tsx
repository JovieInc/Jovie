'use client';

import { useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
import { useGenerateInsightsMutation, useInsightsQuery } from '@/lib/queries';
import type { InsightCategory, InsightResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';
import { InsightEmptyState } from './InsightEmptyState';

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
        className={`mb-3 text-app font-caption tracking-normal ${colorClass}`}
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
        <p className='text-app text-secondary-token'>
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

export interface InsightsPanelViewProps {
  readonly insights: InsightResponse[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly selectedCategory: InsightCategory | 'all';
  readonly onCategoryChange: (category: InsightCategory | 'all') => void;
  readonly onGenerate: () => void;
  readonly isGenerating: boolean;
  readonly testId?: string;
}

export function InsightsPanelView({
  insights,
  isLoading,
  error,
  selectedCategory,
  onCategoryChange,
  onGenerate,
  isGenerating,
  testId = 'dashboard-insights-workspace',
}: Readonly<InsightsPanelViewProps>) {
  const grouped = useMemo(() => {
    const high = insights.filter(i => i.priority === 'high');
    const medium = insights.filter(i => i.priority === 'medium');
    const low = insights.filter(i => i.priority === 'low');
    return { high, medium, low };
  }, [insights]);

  const toolbar = (
    <PageToolbar
      start={null}
      end={
        <PageToolbarActionButton
          ariaLabel={isGenerating ? 'Generating insights' : 'Generate insights'}
          disabled={isGenerating}
          onClick={onGenerate}
          icon={
            <Icon
              name={isGenerating ? 'Loader2' : 'Sparkles'}
              className={isGenerating ? 'animate-spin' : undefined}
            />
          }
          label={isGenerating ? 'Generating...' : 'Generate'}
          iconOnly
          tooltipLabel={
            isGenerating ? 'Generating insights...' : 'Generate insights'
          }
        />
      }
    />
  );

  return (
    <PageShell toolbar={toolbar} data-testid={testId}>
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex flex-col gap-4 px-3 py-2.5 sm:px-4 sm:py-3.5'>
          <AppSegmentControl
            value={selectedCategory}
            onValueChange={onCategoryChange}
            options={CATEGORY_FILTERS}
            aria-label='Filter insights by category'
            surface='ghost'
            className='flex flex-wrap gap-1.5 rounded-none border-0 bg-transparent p-0'
            triggerClassName='min-h-8 border border-subtle bg-surface-1 px-3 py-1 text-[12.5px] text-secondary-token hover:border-default hover:bg-surface-0 hover:text-primary-token data-[state=active]:border-default data-[state=active]:bg-surface-0 data-[state=active]:text-primary-token'
          />

          <InsightsPanelContent
            isLoading={isLoading}
            error={error}
            insights={insights}
            grouped={grouped}
          />
        </div>
      </div>
    </PageShell>
  );
}

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

  return (
    <InsightsPanelView
      insights={insights}
      isLoading={isLoading}
      error={error}
      selectedCategory={selectedCategory}
      onCategoryChange={setSelectedCategory}
      onGenerate={() => generate()}
      isGenerating={isGenerating}
    />
  );
}
