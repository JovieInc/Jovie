'use client';

import { IconButton, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';

/** A bounded preview with the complete text available without expanding its row. */
export function TableDescription({
  text,
  label,
}: {
  readonly text: string;
  readonly label: string;
}) {
  if (!text) return null;
  return (
    <div className='flex min-w-0 items-start gap-1'>
      <span className='line-clamp-2 min-w-0 text-xs leading-snug text-secondary-token'>
        {text}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <IconButton
            variant='inline'
            size='xs'
            ariaLabel={`Read full ${label}`}
            className='shrink-0'
            onClick={event => event.stopPropagation()}
          >
            <MoreHorizontal aria-hidden />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align='start' aria-label={label} className='w-80'>
          <p className='whitespace-pre-wrap break-words p-2 text-sm'>{text}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
