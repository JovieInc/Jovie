'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { usePreviewPanel } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanel();
  const label = isOpen ? 'Hide preview' : 'Show preview';
  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <TooltipShortcut label={label} shortcut='Space' side='bottom'>
      <DashboardHeaderActionButton
        ariaLabel={label}
        pressed={isOpen}
        onClick={toggle}
        icon={<Icon className='h-4 w-4' aria-hidden='true' />}
      />
    </TooltipShortcut>
  );
}
