import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import {
  CHAT_COMPOSER_ATTACH_ARIA_LABEL,
  CHAT_COMPOSER_SEND_ARIA_LABEL,
} from '@/components/jovie/chat-composer-copy';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '@/components/jovie/chat-layout';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { CHAT_HOME_HEADING } from '@/lib/chat/new-chat-entry-contract';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat empty state layout: role-neutral heading and empty composer.
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
        <div className='flex flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8'>
          <div
            className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-8`}
          >
            <h2
              className='relative z-10 text-2xl font-semibold text-primary-token'
              aria-hidden='true'
              data-testid='chat-empty-state-greeting'
            >
              {CHAT_HOME_HEADING}
            </h2>
          </div>

          {/* Reserve the loaded route's bottom composer allocation. */}
          <div
            className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative z-10`}
            data-chat-grid-anchor='composer'
          >
            {/* Decorative only — parent is aria-busy; hide control stubs from AT. */}
            <div className='system-b-shell-loading-composer' aria-hidden='true'>
              <div className='relative flex items-end gap-2 px-3 py-2.5'>
                <div
                  className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token opacity-80'
                  data-label={CHAT_COMPOSER_ATTACH_ARIA_LABEL}
                >
                  <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                </div>
                <div className='min-h-6 min-w-0 flex-1 py-1.5 text-sm leading-6' />
                <div
                  className='system-b-chat-composer-primary-action flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full opacity-80'
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
