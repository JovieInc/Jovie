'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanelState();
  const label = isOpen ? 'Hide preview' : 'Show preview';
  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <TooltipShortcut
      label={label}
      shortcut={RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE}
      side='bottom'
    >
      <DashboardHeaderActionButton
        ariaLabel={label}
        pressed={isOpen}
        onClick={toggle}
        icon={<Icon className='h-3.5 w-3.5' aria-hidden='true' />}
      />
    </TooltipShortcut>
  );
}
