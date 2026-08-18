'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useGenerateInsightsMutation, useInsightsQuery } from '@/lib/queries';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import type { InsightCategory, InsightResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';

interface PrioritySectionProps {
  readonly label: string;
  readonly colorClass?: string;
  readonly colorStyle?: CSSProperties;
  readonly insights: InsightResponse[];
}

function PrioritySection({
  label,
  colorClass,
  colorStyle,
  insights,
}: PrioritySectionProps) {
  if (insights.length === 0) return null;
  return (
    <section>
      <h3
        className={`mb-3 text-app font-caption tracking-normal ${colorClass ?? ''}`}
        style={colorStyle}
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
  readonly onGenerate: () => void;
  readonly onRetry: () => void;
  readonly isGenerating: boolean;
}

function InsightsPanelContent({
  isLoading,
  error,
  insights,
  grouped,
  onGenerate,
  onRetry,
  isGenerating,
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
      <PageErrorState
        title='Failed to load insights.'
        message='Please try again.'
        error={error}
        actionLabel='Retry load'
        onRetry={onRetry}
      />
    );
  }

  if (insights.length === 0) {
    return (
      <EmptyState
        heading='No Insights Yet'
        description='Generate your first set of AI-powered insights to discover actionable trends in your analytics.'
        action={{
          label: isGenerating ? 'Generating...' : 'Generate Insights',
          onClick: onGenerate,
          disabled: isGenerating,
        }}
        secondaryAction={{
          label: 'Share Profile',
          href: APP_ROUTES.CHAT_PROFILE_PANEL,
        }}
        presentation='workspace'
        testId='insights-empty-state'
      />
    );
  }

  return (
    <div className='space-y-6'>
      <PrioritySection
        label='High Priority'
        colorStyle={{ color: getAccentCssVars('orange').solid }}
        insights={grouped.high}
      />
      <PrioritySection
        label='Recommended'
        colorStyle={{ color: getAccentCssVars('blue').solid }}
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
  readonly onRetry: () => void;
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
  onRetry,
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
        <div className='flex min-h-full flex-col gap-4'>
          <AppSegmentControl
            value={selectedCategory}
            onValueChange={onCategoryChange}
            options={CATEGORY_FILTERS}
            aria-label='Filter Insights By Category'
            surface='ghost'
            layout='hug'
            listClassName='flex-wrap gap-1.5'
          />

          <InsightsPanelContent
            isLoading={isLoading}
            error={error}
            insights={insights}
            grouped={grouped}
            onGenerate={onGenerate}
            onRetry={onRetry}
            isGenerating={isGenerating}
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

  const { data, isLoading, error, refetch } = useInsightsQuery({
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
      onRetry={() => {
        void refetch();
      }}
      isGenerating={isGenerating}
    />
  );
}
