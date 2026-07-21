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
      aria-label='Open Profile Panel'
      onClick={onOpen}
      className='flex h-8 w-8 items-center justify-center rounded-lg border border-subtle bg-(--linear-app-content-surface) lg:hidden'
    >
      <PanelRight className='size-4 text-secondary-token' />
    </button>
  );
}
