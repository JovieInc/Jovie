'use client';

import { ArrowDown } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { ThreadComposer } from './ThreadComposer';
import type { ThreadViewData } from './thread.types';

export interface ThreadViewProps {
  /** Thread metadata used for the header. */
  readonly thread: ThreadViewData;
  /** Rendered turns / cards (typically `<ThreadTurn>`s and `<Thread*Card>`s). */
  readonly children: ReactNode;
  /** Composer slot — defaults to `<ThreadComposer placeholder="Reply to this chat..." />`. */
  readonly composer?: ReactNode;
  /** Submit handler forwarded to the default ThreadComposer. */
  readonly onComposerSubmit?: (text: string) => void;
  /** Override the default composer placeholder. */
  readonly composerPlaceholder?: string;
}

/**
 * ThreadView — ChatGPT/Claude-style chat layout.
 *
 * The article is the height-bound parent; the inner div is the scroll
 * boundary; the composer floats over the messages with a gradient fade
 * so the trailing message never reads as a hard band against the input.
 *
 * A floating "scroll to bottom" arrow appears whenever the user has
 * scrolled up out of the bottom 24px and disappears once they're back
 * at the bottom — the at-bottom check is recomputed on mount, on
 * thread change, and via a ResizeObserver so async-mounted media cards
 * don't strand the arrow. The arrow is removed from the DOM when
 * hidden so keyboard users can't tab to an invisible control and
 * screen readers don't announce it.
 *
 * @example
 * ```tsx
 * <ThreadView thread={thread} onComposerSubmit={sendReply}>
 *   <ThreadTurn speaker='jovie'>
 *     <ChatMarkdown content={message.body} />
 *   </ThreadTurn>
 *   {thread.status === 'complete' && (
 *     <>
 *       <ThreadImageCard prompt='…' status='ready' previewUrl={url} />
 *       <ThreadAudioCard title='…' artist='…' duration='3:33' />
 *     </>
 *   )}
 * </ThreadView>
 * ```
 */
export function ThreadView({
  thread,
  children,
  composer,
  onComposerSubmit,
  composerPlaceholder = 'Reply to this chat...',
}: ThreadViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 24);
  }, []);

  useEffect(() => {
    checkAtBottom();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => checkAtBottom());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [checkAtBottom, thread.id]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <article className='relative h-full overflow-hidden'>
      <div
        ref={scrollRef}
        onScroll={checkAtBottom}
        className='absolute inset-0 overflow-y-auto'
      >
        <div className='mx-auto w-full max-w-[44rem] px-(--linear-app-header-padding-x) pb-[9rem] pt-5 sm:pt-6'>
          <header>
            <h1 className='text-[24px] font-semibold leading-tight text-primary-token'>
              {thread.title}
            </h1>
            {thread.entityKind && thread.entityId && (
              <p className='mt-1.5 text-[12.5px] text-tertiary-token'>
                Linked to {thread.entityKind} ·{' '}
                <span className='text-secondary-token'>{thread.entityId}</span>
              </p>
            )}
          </header>

          <div className='mt-8 space-y-4 text-[13.5px] leading-relaxed'>
            {children}
          </div>
        </div>
      </div>

      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-(--linear-app-content-surface) via-(--linear-app-content-surface)/80 to-transparent'
      />
      <div className='absolute inset-x-0 bottom-0'>
        <div className='relative mx-auto w-full max-w-[44rem] px-(--linear-app-header-padding-x) pb-[calc(1rem+env(safe-area-inset-bottom))]'>
          {!atBottom && (
            <button
              type='button'
              onClick={scrollToBottom}
              aria-label='Scroll to bottom'
              className={cn(
                'absolute left-1/2 -top-10 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) text-secondary-token shadow-popover transition-colors duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
              )}
            >
              <ArrowDown className='h-3.5 w-3.5' strokeWidth={2.25} />
            </button>
          )}
          {composer ?? (
            <ThreadComposer
              placeholder={composerPlaceholder}
              onSubmit={onComposerSubmit}
            />
          )}
        </div>
      </div>
    </article>
  );
}
