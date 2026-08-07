'use client';

import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

const AMBIENT_LOGO_OPACITY = 0.18;

function resolveInvitationCopy(greetingName?: string | null): string {
  const trimmedName = greetingName?.trim();
  if (!trimmedName) return "What's next?";
  const firstName = trimmedName.split(/\s+/)[0];
  return `What's next, ${firstName}?`;
}

/**
 * Ambient brand logo + action-forward invitation copy. Centered, low-noise,
 * and layout-stable: it only ever renders inside reserved space (the centered
 * welcome stack or the docked layout's scroll region), never between the
 * composer and the viewport edge, so it cannot move the composer.
 */
export function ChatEmptyStateWelcome({
  greetingName,
}: {
  readonly greetingName?: string | null;
}) {
  return (
    <>
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
      <h2
        className='relative z-10 text-2xl font-semibold text-primary-token'
        data-testid='chat-empty-state-greeting'
      >
        {resolveInvitationCopy(greetingName)}
      </h2>
    </>
  );
}

/**
 * Empty-chat scaffold.
 *
 * - Welcome (no `above`): logo + invitation + composer centered in the viewport.
 * - Task/scaffold (`above`): cards scroll in the upper region; the composer
 *   (and any quick-action rail passed as children) docks to the bottom of the
 *   usable area so the first card is never clipped by mid-viewport absolute
 *   positioning and chips stay reachable without overlapping the dock.
 * - Docked welcome (`showDockedWelcome`, no `above`): the logo + invitation
 *   render centered inside the scroll region while the composer keeps its
 *   bottom-docked geometry, so transient affordances can come and go without
 *   moving the composer.
 */
export function ChatEmptyStateComposerRegion({
  above,
  children,
  greetingName,
  hideWelcomeHeader = false,
  stableDocked = false,
  showDockedWelcome = false,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
  readonly greetingName?: string | null;
  readonly hideWelcomeHeader?: boolean;
  /** Keep composer geometry docked when transient empty-state affordances hide. */
  readonly stableDocked?: boolean;
  /**
   * In the docked layout with no `above` content, fill the scroll region with
   * the centered welcome (ambient logo + invitation) instead of blank space.
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
                <ChatEmptyStateWelcome greetingName={greetingName} />
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
      {showWelcomeHeader ? (
        <ChatEmptyStateWelcome greetingName={greetingName} />
      ) : null}
      <div
        className={`relative z-10 w-full${showWelcomeHeader ? ' mt-6' : ''}`}
        data-testid='chat-empty-state-centered-composer'
      >
        {children}
      </div>
    </div>
  );
}
