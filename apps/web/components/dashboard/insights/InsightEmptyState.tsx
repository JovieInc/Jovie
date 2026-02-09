'use client';

import { Button } from '@jovie/ui';
import { Sparkles } from 'lucide-react';
import { Icon } from '@/components/atoms/Icon';
import { useGenerateInsightsMutation } from '@/lib/queries/useInsightsMutation';

interface InsightEmptyStateProps {
  readonly hasEnoughData: boolean;
}

export function InsightEmptyState({ hasEnoughData }: InsightEmptyStateProps) {
  const { mutate, isPending } = useGenerateInsightsMutation();

  return (
    <div className='flex flex-col items-center justify-center rounded-xl border border-subtle bg-surface-1 p-8 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 dark:bg-purple-500/15'>
        <Sparkles className='h-6 w-6 text-purple-600 dark:text-purple-400' />
      </div>

      <h3 className='mt-4 text-sm font-semibold text-primary-token'>
        {hasEnoughData ? 'No insights yet' : 'Not enough data yet'}
      </h3>

      <p className='mt-1.5 max-w-sm text-xs text-secondary-token leading-relaxed'>
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
          className='mt-4 gap-2'
        >
          <Icon
            name={isPending ? 'Loader2' : 'Sparkles'}
            className={isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
          />
          {isPending ? 'Generating...' : 'Generate Insights'}
        </Button>
      ) : null}
    </div>
  );
}
