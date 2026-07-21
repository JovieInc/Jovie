'use client';

import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

const AMBIENT_LOGO_OPACITY = 0.18;

/**
 * Empty-chat scaffold.
 *
 * - Welcome (no `above`): logo + greeting + composer centered in the viewport.
 * - Task/scaffold (`above`): cards scroll in the upper region; the composer
 *   (and any quick-action rail passed as children) docks to the bottom of the
 *   usable area so the first card is never clipped by mid-viewport absolute
 *   positioning and chips stay reachable without overlapping the dock.
 */
export function ChatEmptyStateComposerRegion({
  above,
  children,
  greetingName,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
  readonly greetingName?: string | null;
}) {
  const trimmedName = greetingName?.trim();
  const greeting = trimmedName ? `Hi, ${trimmedName}` : 'Hi there';
  const showWelcomeHeader = !above;

  if (above) {
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
          {above}
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
      {showWelcomeHeader ? (
        <div
          aria-hidden='true'
          className='relative z-10 mb-4'
          style={{ opacity: AMBIENT_LOGO_OPACITY }}
          data-testid='chat-empty-state-logo'
        >
          <BrandLogo
            size={56}
            className='text-primary-token'
            aria-hidden={true}
          />
        </div>
      ) : null}
      {showWelcomeHeader ? (
        <h2
          className='relative z-10 mb-6 text-2xl font-semibold text-primary-token'
          data-testid='chat-empty-state-greeting'
        >
          {greeting}
        </h2>
      ) : null}
      <div
        className='relative z-10 w-full'
        data-testid='chat-empty-state-centered-composer'
      >
        {children}
      </div>
    </div>
  );
}
