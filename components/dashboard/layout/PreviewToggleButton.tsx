'use client';

import { DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { usePreviewPanel } from '@/app/dashboard/PreviewPanelContext';
import { cn } from '@/lib/utils';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          onClick={toggle}
          aria-label={isOpen ? 'Hide preview' : 'Show preview'}
          aria-pressed={isOpen}
          className={cn('h-9 w-9', isOpen && 'bg-accent/10 text-accent')}
        >
          <DevicePhoneMobileIcon className='h-5 w-5' />
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>
        {isOpen ? 'Hide preview' : 'Show preview'}
        <kbd className='ml-1.5 inline-flex items-center rounded border border-white/20 bg-white/10 px-1 text-[10px] font-medium'>
          Space
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}
