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
        className='h-8 gap-1.5 rounded-[8px] border border-transparent px-2.5 text-[12px] font-[510] tracking-[-0.01em] text-(--linear-text-tertiary) transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-secondary) focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-0) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
      >
        <X className='h-3 w-3' />
        Dismiss
      </Button>
      <Button
        variant='ghost'
        size='sm'
        disabled={isPending}
        onClick={() => mutate({ insightId, status: 'acted_on' })}
        className='h-8 gap-1.5 rounded-[8px] border border-transparent px-2.5 text-[12px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary) transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary) focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-0) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
      >
        <Check className='h-3 w-3' />
        Done
      </Button>
    </div>
  );
}
