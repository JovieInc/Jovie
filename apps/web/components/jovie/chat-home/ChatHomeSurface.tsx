import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  CHAT_HOME_FADE_CLASSNAME,
  type ChatHomeState,
} from './useChatHomeState';

/**
 * The home content slot: Ovie's HUD or Jovie's suggestion and wins. While the
 * user is composing it fades out (inert, hidden from assistive tech, layout
 * kept so nothing jumps) and returns if the composer is emptied. Identical for
 * both apps; only `children` differ.
 */
export function ChatHomeSurface({
  state,
  className,
  children,
}: Readonly<{
  state: ChatHomeState;
  className?: string;
  children: ReactNode;
}>) {
  const composing = state === 'composing';
  return (
    <div
      data-testid='chat-home-surface'
      data-chat-home-state={state}
      aria-hidden={composing || undefined}
      inert={composing || undefined}
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        CHAT_HOME_FADE_CLASSNAME,
        composing ? 'pointer-events-none opacity-0' : 'opacity-100',
        className
      )}
    >
      {children}
    </div>
  );
}
