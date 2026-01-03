'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Smartphone } from 'lucide-react';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DashboardHeaderActionButton
          ariaLabel={isOpen ? 'Hide preview' : 'Show preview'}
          pressed={isOpen}
          onClick={toggle}
          icon={<Smartphone className='h-4 w-4' aria-hidden='true' />}
        />
      </TooltipTrigger>
      <TooltipContent side='bottom'>
        {isOpen ? 'Hide preview' : 'Show preview'}
        <kbd className='ml-1.5 inline-flex items-center rounded border border-subtle bg-surface-2 px-1 text-[10px] font-medium text-secondary-token'>
          Space
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}
