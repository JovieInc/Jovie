'use client';

import { Button } from '@jovie/ui';
import { Check, X } from 'lucide-react';
import { useUpdateInsightMutation } from '@/lib/queries/useInsightsMutation';

interface InsightActionsProps {
  readonly insightId: string;
}

export function InsightActions({ insightId }: InsightActionsProps) {
  const { mutate, isPending } = useUpdateInsightMutation();

  return (
    <div className='flex items-center gap-2'>
      <Button
        variant='ghost'
        size='sm'
        disabled={isPending}
        onClick={() => mutate({ insightId, status: 'dismissed' })}
        className='h-7 gap-1.5 px-2 text-xs text-tertiary-token hover:text-secondary-token'
      >
        <X className='h-3 w-3' />
        Dismiss
      </Button>
      <Button
        variant='ghost'
        size='sm'
        disabled={isPending}
        onClick={() => mutate({ insightId, status: 'acted_on' })}
        className='h-7 gap-1.5 px-2 text-xs text-accent-token hover:text-accent-token/80'
      >
        <Check className='h-3 w-3' />
        Done
      </Button>
    </div>
  );
}
