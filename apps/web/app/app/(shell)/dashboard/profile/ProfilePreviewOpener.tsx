'use client';

import { Button } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { useEffect } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';

/**
 * Toggle button for the profile preview drawer, shown in the header.
 */
function PreviewPanelToggle() {
  const { isOpen, toggle } = usePreviewPanelState();
  const Icon = isOpen ? PanelRightOpen : PanelRight;

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={toggle}
      aria-label='Toggle profile sidebar'
      className='h-10 w-10 border-none'
    >
      <Icon className='h-4 w-4' />
    </Button>
  );
}

/**
 * Auto-opens the preview panel when the profile page mounts
 * and registers a header toggle button for it.
 */
export function ProfilePreviewOpener() {
  const { open } = usePreviewPanelState();
  const { setHeaderActions } = useSetHeaderActions();

  useEffect(() => {
    open();
  }, [open]);

  useEffect(() => {
    setHeaderActions(<PreviewPanelToggle />);
    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  return null;
}
