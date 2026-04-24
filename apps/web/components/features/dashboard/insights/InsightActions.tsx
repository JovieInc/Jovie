'use client';

import { Button } from '@jovie/ui';
import { Check, X } from 'lucide-react';
import { useUpdateInsightMutation } from '@/lib/queries';

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
        className='h-7 gap-1 rounded-lg border border-transparent px-2.5 text-2xs font-caption tracking-[-0.01em] text-tertiary-token transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-1 hover:text-secondary-token focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/20'
      >
        <X className='h-3 w-3' />
        Dismiss
      </Button>
      <Button
        variant='ghost'
        size='sm'
        disabled={isPending}
        onClick={() => mutate({ insightId, status: 'acted_on' })}
        className='h-7 gap-1 rounded-lg border border-transparent px-2.5 text-2xs font-caption tracking-[-0.01em] text-secondary-token transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-1 hover:text-primary-token focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/20'
      >
        <Check className='h-3 w-3' />
        Done
      </Button>
    </div>
  );
}
