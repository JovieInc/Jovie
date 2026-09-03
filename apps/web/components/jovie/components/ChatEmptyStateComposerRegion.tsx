'use client';

import { Button } from '@jovie/ui';
import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  CHAT_EMPTY_HEADING,
  type ChatEmptyRotateSample,
  DESKTOP_CONTENT_GRID_ANCHOR,
  takeNextEmptyChatSample,
} from '../chat-empty-starters';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

const WELCOME_STACK_CLASSNAME =
  'flex min-h-40 w-full shrink-0 flex-col items-center justify-center gap-5 text-center';

export function ChatEmptyStateSamplePreview({
  sample,
}: {
  readonly sample: ChatEmptyRotateSample;
}) {
  return (
    <div
      className='flex w-full max-w-md flex-col gap-2'
      data-sample-id={sample.id}
      data-sample-prompt={sample.prompt}
      data-testid='chat-empty-state-sample'
    >
      <div className='system-b-chat-message-row justify-end'>
        <div
          className='system-b-chat-user-bubble'
          data-testid='chat-empty-state-sample-user'
        >
          <div className='system-b-chat-user-text'>{sample.prompt}</div>
        </div>
      </div>
      <div className='system-b-chat-message-row justify-start'>
        <div
          className='system-b-chat-message-reply'
          data-testid='chat-empty-state-sample-reply'
        >
          {sample.reply}
        </div>
      </div>
    </div>
  );
}

/**
 * Role-neutral New Chat entry: locked `Just ask` heading plus one rotating
 * executable sample conversation. Layout-stable: heading + sample always
 * render inside reserved space so rotation and load cannot move the composer.
 */
export function ChatEmptyStateWelcome({
  onSelectSample,
}: {
  readonly onSelectSample?: (prompt: string) => void;
}) {
  const [sample] = useState(() => takeNextEmptyChatSample());

  return (
    <div
      className={WELCOME_STACK_CLASSNAME}
      data-testid='chat-empty-state-welcome'
    >
      <h2
        className='relative z-10 shrink-0 text-2xl font-semibold text-primary-token'
        data-testid='chat-empty-state-greeting'
      >
        {CHAT_EMPTY_HEADING}
      </h2>
      {onSelectSample ? (
        <Button
          type='button'
          variant='ghost'
          aria-label={`Ask “${sample.prompt}”`}
          className='h-auto min-h-0 w-full max-w-md justify-start rounded-2xl p-1 text-left font-normal shadow-none before:hidden hover:bg-transparent hover:text-inherit active:bg-transparent [&>span]:flex [&>span]:w-full [&>span]:flex-col'
          data-testid='chat-empty-state-sample-button'
          onClick={() => onSelectSample(sample.prompt)}
        >
          <div aria-hidden='true' className='w-full'>
            <ChatEmptyStateSamplePreview sample={sample} />
          </div>
        </Button>
      ) : (
        <ChatEmptyStateSamplePreview sample={sample} />
      )}
    </div>
  );
}

/**
 * Empty-chat scaffold.
 *
 * - Welcome (no `above`): Just ask + sample conversation + composer.
 * - Task/scaffold (`above`): cards scroll in the upper region; the composer
 *   (and any quick-action rail passed as children) docks to the bottom of the
 *   usable area so the first card is never clipped by mid-viewport absolute
 *   positioning and chips stay reachable without overlapping the dock.
 * - Docked welcome (`showDockedWelcome`, no `above`): the heading and sample
 *   render centered inside the scroll region while the composer keeps its
 *   bottom-docked geometry, so transient affordances can come and go without
 *   moving the composer.
 */
export function ChatEmptyStateComposerRegion({
  above,
  children,
  hideWelcomeHeader = false,
  stableDocked = false,
  showDockedWelcome = false,
  onSelectSample,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
  readonly hideWelcomeHeader?: boolean;
  /** Keep composer geometry docked when transient empty-state affordances hide. */
  readonly stableDocked?: boolean;
  /**
   * In the docked layout with no `above` content, fill the scroll region with
   * the centered welcome (Just ask + sample) instead of blank space.
   */
  readonly showDockedWelcome?: boolean;
  readonly onSelectSample?: (prompt: string) => void;
}) {
  const showWelcomeHeader = !above && !hideWelcomeHeader;
  const welcome = <ChatEmptyStateWelcome onSelectSample={onSelectSample} />;

  if (above || stableDocked) {
    const ownsTopSpacing = Boolean(stableDocked && !above);
    return (
      <div
        className={cn(
          CHAT_CONTENT_SHELL_CLASSNAME,
          'relative flex min-h-full flex-col px-1',
          ownsTopSpacing ? 'pt-0 pb-4 sm:pb-5' : 'py-4 sm:py-5'
        )}
        data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
        data-testid='chat-empty-state-composer-region'
        data-layout='docked'
        data-top-spacing-owner={ownsTopSpacing ? 'none' : undefined}
      >
        {/* Scrollable card stack — first item starts at top, never absolute-clipped */}
        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3'
          data-testid='chat-empty-state-above-scroll'
        >
          {above ??
            (showDockedWelcome && !hideWelcomeHeader ? (
              <div className='flex min-h-full flex-col items-center justify-center text-center'>
                {welcome}
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
          data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${CHAT_CONTENT_SHELL_CLASSNAME} chat-stagger relative flex min-h-full flex-col items-center justify-center px-1 py-8`}
      data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
      data-testid='chat-empty-state-composer-region'
      data-layout='centered'
    >
      {showWelcomeHeader ? welcome : null}
      <div
        className={`relative z-10 w-full${showWelcomeHeader ? ' mt-6' : ''}`}
        data-testid='chat-empty-state-centered-composer'
        data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
      >
        {children}
      </div>
    </div>
  );
}
