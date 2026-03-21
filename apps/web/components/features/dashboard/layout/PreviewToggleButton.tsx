'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanelState();
  const label = isOpen ? 'Hide preview' : 'Show preview';
  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <TooltipShortcut label={label} shortcut='Space' side='bottom'>
      <DashboardHeaderActionButton
        ariaLabel={label}
        pressed={isOpen}
        onClick={toggle}
        className='bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
        icon={<Icon className='h-3.5 w-3.5' aria-hidden='true' />}
      />
    </TooltipShortcut>
  );
}
