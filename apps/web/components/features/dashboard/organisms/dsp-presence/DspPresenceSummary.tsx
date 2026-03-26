'use client';

import { LINEAR_SURFACE } from '@/features/dashboard/tokens/card-tokens';
import { cn } from '@/lib/utils';

interface DspPresenceSummaryProps {
  readonly confirmedCount: number;
  readonly suggestedCount: number;
}

export function DspPresenceSummary({
  confirmedCount,
  suggestedCount,
}: DspPresenceSummaryProps) {
  return (
    <div
      className={cn(
        LINEAR_SURFACE.toolbar,
        'shrink-0 border-b px-3.5 py-2.5 lg:px-4'
      )}
    >
      <div className='flex items-center gap-3'>
        <h1 className='text-[13px] font-[560] tracking-[-0.01em] text-primary-token'>
          DSP Presence
        </h1>

        <div className='flex items-center gap-2.5 text-[11px] text-tertiary-token'>
          <span>
            {confirmedCount} matched platform{confirmedCount === 1 ? '' : 's'}
          </span>
          {suggestedCount > 0 && (
            <>
              <span className='text-quaternary-token'>&middot;</span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-amber-500' />
                {suggestedCount} pending review
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
