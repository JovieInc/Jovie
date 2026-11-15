'use client';

import { PlainButton } from '@jovie/ui';
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
    <PlainButton
      type='button'
      aria-label='Open Profile Panel'
      onClick={onOpen}
      className='relative flex h-8 w-8 items-center justify-center rounded-lg border border-subtle bg-(--app-shell-content-surface) before:absolute before:left-1/2 before:top-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 lg:hidden'
    >
      <PanelRight className='size-4 text-secondary-token' />
    </PlainButton>
  );
}
