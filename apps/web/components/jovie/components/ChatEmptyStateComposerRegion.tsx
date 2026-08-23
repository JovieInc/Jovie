'use client';

import { type ReactNode, useState } from 'react';

import { takeNextEmptyChatGreeting } from '../chat-empty-greeting';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * One locked rotating greeting. Centered, low-noise, and layout-stable: it
 * only ever renders inside reserved space (the centered welcome stack or the
 * docked layout's scroll region), never between the composer and the viewport
 * edge, so it cannot move the composer.
 */
export function ChatEmptyStateWelcome() {
  const [greeting] = useState(() => takeNextEmptyChatGreeting());

  return (
    <h2
      className='relative z-10 text-2xl font-semibold text-primary-token'
      data-testid='chat-empty-state-greeting'
    >
      {greeting}
    </h2>
  );
}

/**
 * Empty-chat scaffold.
 *
 * - Welcome (no `above`): rotating greeting + composer centered in the viewport.
 * - Task/scaffold (`above`): cards scroll in the upper region; the composer
 *   (and any quick-action rail passed as children) docks to the bottom of the
 *   usable area so the first card is never clipped by mid-viewport absolute
 *   positioning and chips stay reachable without overlapping the dock.
 * - Docked welcome (`showDockedWelcome`, no `above`): the greeting renders
 *   centered inside the scroll region while the composer keeps its
 *   bottom-docked geometry, so transient affordances can come and go without
 *   moving the composer.
 */
export function ChatEmptyStateComposerRegion({
  above,
  children,
  hideWelcomeHeader = false,
  stableDocked = false,
  showDockedWelcome = false,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
  readonly hideWelcomeHeader?: boolean;
  /** Keep composer geometry docked when transient empty-state affordances hide. */
  readonly stableDocked?: boolean;
  /**
   * In the docked layout with no `above` content, fill the scroll region with
   * the centered welcome (rotating greeting) instead of blank space.
   */
  readonly showDockedWelcome?: boolean;
}) {
  const showWelcomeHeader = !above && !hideWelcomeHeader;

  if (above || stableDocked) {
    return (
      <div
        className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative flex min-h-full flex-col px-1 py-4 sm:py-5`}
        data-testid='chat-empty-state-composer-region'
        data-layout='docked'
      >
        {/* Scrollable card stack — first item starts at top, never absolute-clipped */}
        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3'
          data-testid='chat-empty-state-above-scroll'
        >
          {above ??
            (showDockedWelcome && !hideWelcomeHeader ? (
              <div
                className='flex min-h-full flex-col items-center justify-center text-center'
                data-testid='chat-empty-state-welcome'
              >
                <ChatEmptyStateWelcome />
              </div>
            ) : (
              <div className='h-full' aria-hidden='true' />
            ))}
        </div>
        {/* Bottom-docked composer + quick-action chips (passed as children) */}
        <div
          className='relative z-10 w-full shrink-0 pt-2'
          data-testid='chat-empty-state-centered-composer'
          data-dock='bottom'
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${CHAT_CONTENT_SHELL_CLASSNAME} chat-stagger relative flex min-h-full flex-col items-center justify-center px-1 py-8`}
      data-testid='chat-empty-state-composer-region'
      data-layout='centered'
    >
      {showWelcomeHeader ? <ChatEmptyStateWelcome /> : null}
      <div
        className={`relative z-10 w-full${showWelcomeHeader ? ' mt-6' : ''}`}
        data-testid='chat-empty-state-centered-composer'
      >
        {children}
      </div>
    </div>
  );
}
