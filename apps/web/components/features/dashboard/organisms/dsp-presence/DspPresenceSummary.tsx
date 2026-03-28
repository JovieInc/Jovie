'use client';

import { PageToolbar } from '@/components/organisms/table';

interface DspPresenceSummaryProps {
  readonly confirmedCount: number;
  readonly suggestedCount: number;
}

export function DspPresenceSummary({
  confirmedCount,
  suggestedCount,
}: DspPresenceSummaryProps) {
  return (
    <PageToolbar
      start={
        <div className='flex min-w-0 items-center gap-3'>
          <span className='shrink-0 text-[12px] font-[560] tracking-[-0.01em] text-primary-token'>
            DSP Presence
          </span>
          <div className='flex min-w-0 items-center gap-2.5 text-[11px] text-tertiary-token'>
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
      }
    />
  );
}
