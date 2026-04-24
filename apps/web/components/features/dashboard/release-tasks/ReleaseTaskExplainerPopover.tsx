'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { Info } from 'lucide-react';
import { useState } from 'react';

interface ReleaseTaskExplainerPopoverProps {
  readonly explainerText: string;
  readonly learnMoreUrl?: string | null;
}

export function ReleaseTaskExplainerPopover({
  explainerText,
  learnMoreUrl,
}: ReleaseTaskExplainerPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='flex-shrink-0 rounded p-0.5 text-tertiary-token opacity-60 hover:opacity-100 hover:bg-surface-1 transition-opacity'
          aria-label='Task info'
        >
          <Info className='h-3.5 w-3.5' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        side='top'
        sideOffset={4}
        className='w-72 rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 p-3 shadow-lg'
      >
        <p className='text-[11.5px] leading-relaxed text-secondary-token'>
          {explainerText}
        </p>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='mt-2 inline-block text-2xs text-[var(--linear-accent,#5e6ad2)] hover:underline'
          >
            Learn more &rarr;
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
