'use client';

interface DspPresenceSummaryProps {
  readonly confirmedCount: number;
  readonly suggestedCount: number;
}

export function DspPresenceSummary({
  confirmedCount,
  suggestedCount,
}: DspPresenceSummaryProps) {
  return (
    <div className='shrink-0 border-b border-(--linear-border-subtle) px-4 py-3 lg:px-6'>
      <div className='flex items-center gap-4'>
        <h1 className='text-[15px] font-[590] text-(--linear-text-primary)'>
          DSP Presence
        </h1>

        <div className='flex items-center gap-3 text-[13px] text-(--linear-text-tertiary)'>
          <span>
            {confirmedCount} matched platform{confirmedCount !== 1 ? 's' : ''}
          </span>
          {suggestedCount > 0 && (
            <>
              <span className='text-(--linear-text-quaternary)'>&middot;</span>
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
