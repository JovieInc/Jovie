'use client';

import { Badge } from '@jovie/ui';
import { useEffect, useReducer } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  isPipelineBottleneckFresh,
  PIPELINE_BOTTLENECK_MAX_AGE_MS,
} from '@/lib/ovie/pipeline-bottleneck';
import { usePipelineBottleneckQuery } from '@/lib/queries/usePipelineBottleneckQuery';

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

/** Mount in a fixed-height admin status slot to keep surrounding work stable. */
export function PipelineBottleneckBanner({
  isAdmin,
}: {
  readonly isAdmin: boolean;
}) {
  const { data, isError } = usePipelineBottleneckQuery(isAdmin);
  const [, expire] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (
      !data ||
      !isAdmin ||
      !isPipelineBottleneckFresh(data.observedAt, Date.now())
    )
      return;
    const remaining =
      Date.parse(data.observedAt) + PIPELINE_BOTTLENECK_MAX_AGE_MS - Date.now();
    if (remaining < 0) return;
    const timer = setTimeout(expire, remaining + 1);
    return () => clearTimeout(timer);
  }, [data, isAdmin]);

  if (
    !isAdmin ||
    isError ||
    !data ||
    !isPipelineBottleneckFresh(data.observedAt, Date.now())
  )
    return null;
  if (data.status === 'clear') {
    return (
      <p className='flex h-20 items-center px-3 text-xs text-secondary-token'>
        No current bottleneck
      </p>
    );
  }
  const needsYou = data.status === 'needs-you';
  return (
    <div className='grid h-20 min-w-0'>
      <ContentSurfaceCard
        surface='details'
        className='min-w-0'
        aria-label='Pipeline Bottleneck'
      >
        <div className='flex h-full min-w-0 items-center gap-3 px-3 py-2'>
          <Badge variant={needsYou ? 'warning' : 'secondary'} size='sm'>
            {needsYou ? 'Needs you' : 'Agentic'}
          </Badge>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-app text-primary-token'>
              {data.rank1?.oneLine}
            </p>
            {needsYou && data.cost ? (
              <>
                <p className='truncate text-xs tabular-nums text-secondary-token'>
                  {dollars.format(data.cost.monthlyUsd).replace(/\.00$/, '')}/mo
                  · {data.cost.item}
                </p>
                <p className='truncate text-xs text-secondary-token'>
                  {data.impact}
                </p>
              </>
            ) : (
              <p className='text-xs text-secondary-token'>Agents on it</p>
            )}
          </div>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
