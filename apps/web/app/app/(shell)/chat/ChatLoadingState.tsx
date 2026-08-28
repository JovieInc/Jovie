import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import {
  CHAT_COMPOSER_ATTACH_ARIA_LABEL,
  CHAT_COMPOSER_SEND_ARIA_LABEL,
} from '@/components/jovie/chat-composer-copy';
import {
  CHAT_EMPTY_HEADING,
  CHAT_EMPTY_STILL_SAMPLE,
  DESKTOP_CONTENT_GRID_ANCHOR,
} from '@/components/jovie/chat-empty-starters';
import {
  CHAT_CONTENT_SHELL_CLASSNAME,
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
} from '@/components/jovie/chat-layout';
import { ChatEmptyStateSamplePreview } from '@/components/jovie/components/ChatEmptyStateComposerRegion';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat empty state layout: Just ask heading, reserved
 * sample conversation, and empty composer. Nested shells do not add a
 * second top gap under the desktop header.
 */
export default function ChatLoading() {
  return (
    <ChatWorkspaceSurface>
      <div
        className='flex h-full flex-col'
        aria-busy='true'
        aria-live='polite'
        data-testid='chat-loading'
      >
        <div
          className={`flex flex-1 flex-col ${CHAT_EMPTY_VIEWPORT_CLASSNAME}`}
          data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
          data-top-spacing-owner={CHAT_EMPTY_TOP_SPACING_OWNER}
        >
          <div
            className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 pt-0`}
            data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
            data-top-spacing-owner='none'
          >
            <div
              className='flex min-h-40 w-full flex-col items-center justify-center gap-5 text-center'
              data-testid='chat-empty-state-welcome'
            >
              <h2
                className='relative z-10 text-2xl font-semibold text-primary-token'
                aria-hidden='true'
                data-testid='chat-empty-state-greeting'
              >
                {CHAT_EMPTY_HEADING}
              </h2>
              <div aria-hidden='true'>
                <ChatEmptyStateSamplePreview sample={CHAT_EMPTY_STILL_SAMPLE} />
              </div>
            </div>
          </div>

          {/* Reserve the loaded route's bottom composer allocation. */}
          <div
            className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative z-10`}
            data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
          >
            {/* Decorative only — parent is aria-busy; hide control stubs from AT. */}
            <div className='system-b-shell-loading-composer' aria-hidden='true'>
              <div className='relative flex items-end gap-2 px-3 py-2.5'>
                <div
                  className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'
                  data-label={CHAT_COMPOSER_ATTACH_ARIA_LABEL}
                >
                  <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                </div>
                <div className='min-h-6 min-w-0 flex-1 py-1.5 text-sm leading-6' />
                <div
                  className='system-b-chat-composer-primary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full'
                  data-label={CHAT_COMPOSER_SEND_ARIA_LABEL}
                >
                  <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
