'use client';

import { Button } from '@jovie/ui';
import { Sparkles } from 'lucide-react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useGenerateInsightsMutation } from '@/lib/queries/useInsightsMutation';

interface InsightEmptyStateProps {
  readonly hasEnoughData?: boolean;
}

export function InsightEmptyState({
  hasEnoughData = true,
}: InsightEmptyStateProps) {
  const { mutate, isPending } = useGenerateInsightsMutation();

  return (
    <ContentSurfaceCard className='flex flex-col items-center justify-center p-8 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-[14px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
        <Sparkles className='h-5 w-5 text-(--linear-text-secondary)' />
      </div>

      <h3 className='mt-4 text-[13px] font-[590] text-primary-token'>
        {hasEnoughData ? 'No insights yet' : 'Not enough data yet'}
      </h3>

      <p className='mt-1.5 max-w-sm text-[13px] text-secondary-token leading-relaxed'>
        {hasEnoughData
          ? 'Generate your first set of AI-powered insights to discover actionable trends in your analytics.'
          : 'Keep sharing your profile link to build up analytics data. Once you have enough traffic, we can generate insights for you.'}
      </p>

      {hasEnoughData ? (
        <Button
          variant='primary'
          size='sm'
          disabled={isPending}
          onClick={() => mutate()}
          className='mt-4 h-8 gap-2 px-3'
        >
          <Icon
            name={isPending ? 'Loader2' : 'Sparkles'}
            className={isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
          />
          {isPending ? 'Generating...' : 'Generate Insights'}
        </Button>
      ) : null}
    </ContentSurfaceCard>
  );
}
