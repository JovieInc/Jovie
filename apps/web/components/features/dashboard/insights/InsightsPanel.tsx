'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import {
  getInsightsEmptyCopy,
  type InsightsEmptyCopy,
} from '@/lib/insights/empty-state-copy';
import { useGenerateInsightsMutation, useInsightsQuery } from '@/lib/queries';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import type {
  InsightCategory,
  InsightGenerateResponse,
  InsightResponse,
} from '@/types/insights';
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
  readonly emptyCopy: InsightsEmptyCopy;
}

const SKELETON_ROW_KEYS = ['row-1', 'row-2', 'row-3'] as const;

/**
 * Loading rows drawn in InsightCard's own geometry (flat rows, 28px icon
 * chip, title + badge, two description lines, footer rule) under one
 * section label, so the list does not jump when insights arrive.
 */
function InsightsLoadingRows() {
  return (
    <section aria-hidden='true' data-testid='insights-loading-rows'>
      <div className='mb-3 flex h-5 items-center'>
        <div className='h-3 w-24 rounded-sm skeleton motion-reduce:animate-none' />
      </div>
      {SKELETON_ROW_KEYS.map(key => (
        <div
          key={key}
          className='border-b border-subtle px-1 py-3.5 last:border-b-0'
        >
          <div className='flex items-start gap-3'>
            <div className='h-7 w-7 shrink-0 rounded-lg skeleton motion-reduce:animate-none' />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <div className='h-4 w-48 max-w-[60%] rounded-sm skeleton motion-reduce:animate-none' />
                <div className='h-4 w-16 rounded-md skeleton motion-reduce:animate-none' />
              </div>
              <div className='mt-2 h-3 w-full rounded-sm skeleton motion-reduce:animate-none' />
              <div className='mt-1.5 h-3 w-4/5 rounded-sm skeleton motion-reduce:animate-none' />
              <div className='mt-3 flex items-center justify-between border-t border-subtle pt-3'>
                <div className='h-3 w-28 rounded-sm skeleton motion-reduce:animate-none' />
                <div className='h-7 w-32 rounded-lg skeleton motion-reduce:animate-none' />
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function generateLabel(copy: InsightsEmptyCopy): string {
  if (copy.mode === 'failed') return 'Try Again';
  if (copy.mode === 'nothing-new') return 'Generate Again';
  return 'Generate Insights';
}

function InsightsPanelContent({
  isLoading,
  error,
  insights,
  grouped,
  onGenerate,
  onRetry,
  isGenerating,
  emptyCopy,
}: InsightsPanelContentProps) {
  if (isLoading) {
    return <InsightsLoadingRows />;
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
        heading={emptyCopy.heading}
        description={emptyCopy.description}
        {...(emptyCopy.mode === 'needs-activity'
          ? {
              action: {
                label: 'Share Your Profile',
                href: APP_ROUTES.CHAT_PROFILE_PANEL,
              },
            }
          : {
              action: {
                label: isGenerating
                  ? 'Generating...'
                  : generateLabel(emptyCopy),
                onClick: onGenerate,
                disabled: isGenerating,
              },
              secondaryAction: {
                label: 'Share Your Profile',
                href: APP_ROUTES.CHAT_PROFILE_PANEL,
              },
            })}
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
  /** Result of the last Generate press, so a short run can say why. */
  readonly lastRun?: Pick<
    InsightGenerateResponse,
    'insightsGenerated' | 'dataPointsAnalyzed'
  > | null;
  readonly generateFailed?: boolean;
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
  lastRun = null,
  generateFailed = false,
  testId = 'dashboard-insights-workspace',
}: Readonly<InsightsPanelViewProps>) {
  const emptyCopy = getInsightsEmptyCopy({ lastRun, generateFailed });
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
            emptyCopy={emptyCopy}
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

  const {
    mutate: generate,
    isPending: isGenerating,
    data: lastRun,
    isError: generateFailed,
  } = useGenerateInsightsMutation();

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
      lastRun={lastRun ?? null}
      generateFailed={generateFailed}
    />
  );
}

const noop = () => undefined;

/**
 * Route-level loading state for /app/insights: the same workspace (toolbar,
 * category filters, list rows) the panel renders while its query loads, so
 * the hand-off from route skeleton to panel skeleton to data never shifts.
 */
export function InsightsPanelLoading() {
  return (
    <InsightsPanelView
      insights={[]}
      isLoading
      error={null}
      selectedCategory='all'
      onCategoryChange={noop}
      onGenerate={noop}
      onRetry={noop}
      isGenerating={false}
    />
  );
}
