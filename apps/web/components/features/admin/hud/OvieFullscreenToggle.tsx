'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import { Maximize2 } from 'lucide-react';
import { fullscreenShortcutLabel } from '@/lib/ovie/home/fullscreen-mode';

export function OvieFullscreenToggle({
  onToggle,
  inDesktopApp,
}: Readonly<{ onToggle: () => void; inDesktopApp: boolean }>) {
  const shortcut = fullscreenShortcutLabel(inDesktopApp);
  return (
    <TooltipShortcut label='Full Screen' shortcut={shortcut} side='bottom'>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={`Full Screen ${shortcut}`}
        data-testid='ovie-fullscreen-toggle'
        onClick={onToggle}
      >
        <Maximize2 className='size-4' aria-hidden='true' />
      </Button>
    </TooltipShortcut>
  );
}
