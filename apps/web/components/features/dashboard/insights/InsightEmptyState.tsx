'use client';

import { Button } from '@jovie/ui';
import { Sparkles } from 'lucide-react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useGenerateInsightsMutation } from '@/lib/queries';

interface InsightEmptyStateProps {
  readonly hasEnoughData?: boolean;
}

export function InsightEmptyState({
  hasEnoughData = true,
}: InsightEmptyStateProps) {
  const { mutate, isPending } = useGenerateInsightsMutation();

  return (
    <ContentSurfaceCard className='flex flex-col items-center justify-center px-2.5 py-2.5 text-center'>
      <div className='flex h-7 w-7 items-center justify-center rounded-md bg-surface-1'>
        <Sparkles className='h-3.5 w-3.5 text-secondary-token' />
      </div>

      <h3 className='mt-1.5 text-[13px] font-[590] text-primary-token'>
        {hasEnoughData ? 'No insights yet' : 'Not enough data yet'}
      </h3>

      <p className='mt-0.5 max-w-sm text-[13px] text-secondary-token leading-snug'>
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
          className='mt-2.5 h-7 gap-1.5 px-2.5'
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
