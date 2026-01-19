'use client';

import { TooltipShortcut } from '@jovie/ui';
import { Smartphone } from 'lucide-react';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanel();
  const label = isOpen ? 'Hide preview' : 'Show preview';

  return (
    <TooltipShortcut label={label} shortcut='Space' side='bottom'>
      <DashboardHeaderActionButton
        ariaLabel={label}
        pressed={isOpen}
        onClick={toggle}
        icon={<Smartphone className='h-4 w-4' aria-hidden='true' />}
      />
    </TooltipShortcut>
  );
}
