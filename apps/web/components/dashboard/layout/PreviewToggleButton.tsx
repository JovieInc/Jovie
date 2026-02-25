'use client';

import { TooltipShortcut } from '@jovie/ui';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PanelToggleButton } from '@/components/dashboard/atoms/PanelToggleButton';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanelState();

  return (
    <TooltipShortcut label='Show preview' shortcut='Space' side='bottom'>
      <PanelToggleButton
        isOpen={isOpen}
        onToggle={toggle}
        ariaLabel='Show preview'
      />
    </TooltipShortcut>
  );
}
