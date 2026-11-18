'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import {
  EmptyState,
  type EmptyStateProps,
} from '@/components/molecules/EmptyState';
import { RouteSegmentControl } from '@/components/molecules/RouteSegmentControl';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getAudienceWorkspaceNavigation } from '@/lib/audience/workspace-navigation';
import {
  getInsightsEmptyCopy,
  type InsightsEmptyCopy,
  type InsightsGenerateFailure,
} from '@/lib/insights/empty-state-copy';
import { useGenerateInsightsMutation, useInsightsQuery } from '@/lib/queries';
import { FetchError } from '@/lib/queries/fetch';
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
  readonly onShowAll: () => void;
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
                <div className='h-4 w-48 max-w-full rounded-sm skeleton motion-reduce:animate-none' />
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
  return copy.mode === 'failed' ? 'Try Again' : 'Generate Insights';
}

const SHARE_PROFILE_ACTION = {
  label: 'Share Your Profile',
  href: APP_ROUTES.CHAT_PROFILE_PANEL,
} as const;

/**
 * One next step per empty mode. A finished run, a cooldown or a plan gate
 * gets no Generate button: the server cooldown or the plan would only refuse
 * it again.
 */
function emptyStateActions(
  copy: InsightsEmptyCopy,
  {
    isGenerating,
    onGenerate,
    onShowAll,
    onRetry,
  }: {
    readonly isGenerating: boolean;
    readonly onGenerate: () => void;
    readonly onShowAll: () => void;
    /** Refetches the insights list; never starts a new run. */
    readonly onRetry: () => void;
  }
): Pick<EmptyStateProps, 'action' | 'secondaryAction'> {
  switch (copy.mode) {
    case 'needs-activity':
    case 'nothing-new':
    case 'rate-limited':
      return { action: SHARE_PROFILE_ACTION };
    case 'needs-plan':
      return {
        action: { label: 'See Plans', href: APP_ROUTES.SETTINGS_BILLING },
      };
    case 'category-empty':
      return { action: { label: 'Show All', onClick: onShowAll } };
    case 'still-working':
      return { action: { label: 'Check Again', onClick: onRetry } };
    default:
      return {
        action: {
          label: isGenerating ? 'Generating…' : generateLabel(copy),
          onClick: onGenerate,
          disabled: isGenerating,
        },
        secondaryAction: SHARE_PROFILE_ACTION,
      };
  }
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
  onShowAll,
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
        {...emptyStateActions(emptyCopy, {
          isGenerating,
          onGenerate,
          onShowAll,
          onRetry,
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
  /** Status of the failed Generate press (429 cooldown, 403 plan gate). */
  readonly generateFailure?: InsightsGenerateFailure | null;
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
  generateFailure = null,
  testId = 'dashboard-insights-workspace',
}: Readonly<InsightsPanelViewProps>) {
  const categoryLabel =
    selectedCategory === 'all'
      ? null
      : (CATEGORY_FILTERS.find(f => f.value === selectedCategory)?.label ??
        null);
  const emptyCopy = getInsightsEmptyCopy({
    lastRun,
    generateFailed,
    generateFailure,
    categoryLabel,
  });
  const grouped = useMemo(() => {
    const high = insights.filter(i => i.priority === 'high');
    const medium = insights.filter(i => i.priority === 'medium');
    const low = insights.filter(i => i.priority === 'low');
    return { high, medium, low };
  }, [insights]);

  const toolbar = (
    <PageToolbar
      start={
        <RouteSegmentControl
          value='insights'
          aria-label='Audience Workspace'
          className='max-w-72'
          options={getAudienceWorkspaceNavigation()}
        />
      }
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
          label={isGenerating ? 'Generating…' : 'Generate'}
          iconOnly
          tooltipLabel={
            isGenerating ? 'Generating insights…' : 'Generate insights'
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
            listClassName='flex-wrap'
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
            onShowAll={() => onCategoryChange('all')}
          />
        </div>
      </div>
    </PageShell>
  );
}

function readGenerateFailure(error: unknown): InsightsGenerateFailure {
  if (!(error instanceof FetchError)) return { status: null };
  const next = error.parsedBody?.nextAllowedAt;
  return {
    status: error.status,
    nextAllowedAt: typeof next === 'string' ? next : null,
    kind: error.kind,
  };
}

export function InsightsPanel() {
  const [selectedCategory, setSelectedCategory] = useState<
    InsightCategory | 'all'
  >('all');

  const categoryFilter = useMemo(
    () => (selectedCategory === 'all' ? undefined : [selectedCategory]),
    [selectedCategory]
  );

  const { data, dataUpdatedAt, isLoading, error, refetch } = useInsightsQuery({
    category: categoryFilter,
    limit: 50,
  });

  const {
    mutate: generate,
    isPending: isGenerating,
    data: lastRun,
    isError: generateFailed,
    error: generateError,
    submittedAt,
    reset: resetGenerate,
  } = useGenerateInsightsMutation();

  // A failed press is stale once the list has loaded again after it (Check
  // Again or any refetch), so the copy never sticks on "Still Generating".
  useEffect(() => {
    if (generateFailed && dataUpdatedAt > submittedAt) resetGenerate();
  }, [generateFailed, dataUpdatedAt, submittedAt, resetGenerate]);

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
      generateFailure={
        generateFailed ? readGenerateFailure(generateError) : null
      }
    />
  );
}
