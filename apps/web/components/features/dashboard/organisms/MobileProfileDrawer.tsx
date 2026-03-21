'use client';

import { PanelRight } from 'lucide-react';

export interface MobileProfileDrawerProps {
  readonly onOpen: () => void;
}

/**
 * MobileProfileDrawer – menu icon button that toggles the full-screen RightDrawer.
 *
 * Previously rendered an avatar trigger + Sheet; now delegates entirely to the
 * parent-provided `onOpen` callback (which toggles PreviewPanelContext).
 */
export function MobileProfileDrawer({ onOpen }: MobileProfileDrawerProps) {
  return (
    <button
      type='button'
      aria-label='Open profile panel'
      onClick={onOpen}
      className='flex h-8 w-8 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] lg:hidden'
    >
      <PanelRight className='size-4 text-secondary-token' />
    </button>
  );
}
