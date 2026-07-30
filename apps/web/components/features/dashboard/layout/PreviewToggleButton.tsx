'use client';

import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';

export function PreviewToggleButton() {
  const { isOpen, toggle } = usePreviewPanelState();
  return (
    <RailToggleButton
      side='right'
      open={isOpen}
      openLabel='Hide preview'
      closedLabel='Show preview'
      onToggle={toggle}
      shortcut={RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE}
    />
  );
}
