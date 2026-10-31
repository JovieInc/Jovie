'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import { Maximize2, Minimize2 } from 'lucide-react';
import { fullscreenShortcutLabel } from '@/lib/ovie/home/fullscreen-mode';

export function OvieFullscreenToggle({
  on = false,
  onToggle,
  inDesktopApp,
}: Readonly<{
  on?: boolean;
  onToggle: () => void;
  inDesktopApp: boolean;
}>) {
  const shortcut = fullscreenShortcutLabel(inDesktopApp);
  return (
    <TooltipShortcut
      label={on ? 'Exit Full Screen' : 'Full Screen'}
      shortcut={shortcut}
      side='bottom'
    >
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={`${on ? 'Exit Full Screen' : 'Full Screen'} ${shortcut}`}
        aria-pressed={on}
        data-testid='ovie-fullscreen-toggle'
        onClick={onToggle}
      >
        {on ? (
          <Minimize2 className='size-4' aria-hidden='true' />
        ) : (
          <Maximize2 className='size-4' aria-hidden='true' />
        )}
      </Button>
    </TooltipShortcut>
  );
}
