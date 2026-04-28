'use client';

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

export interface SuggestionCardProps {
  /** Card heading. Renders as an h2 with the cinematic title weight + tracking. */
  readonly title: string;
  /** Body copy under the heading. Pre-formatted string; the card does not render markdown. */
  readonly body: string;
  /** Label on the primary action button. */
  readonly actionLabel: string;
  readonly onAct?: () => void;
  /**
   * Dismiss handler. When omitted, the dismiss button is hidden so the
   * card never advertises a no-op action.
   */
  readonly onDismiss?: () => void;
  /** Override the dismiss button copy (defaults to "Dismiss"). */
  readonly dismissLabel?: string;
  readonly className?: string;
}

/**
 * SuggestionCard — premium home-canvas card surfacing one Jovie
 * suggestion (e.g. "Detroit listeners up 340% — book a show"). Single
 * heading + body + dismiss/act footer. The card carries inset highlight
 * + soft drop shadow + cinematic transition so it reads as one of a
 * stack of suggestions, not generic notification chrome.
 *
 * @example
 * ```tsx
 * <SuggestionCard
 *   title='Detroit listeners up 340% — book a show'
 *   body='A promoter at the Magic Stick reached out yesterday. I have a draft pitch ready that ties to your Spotify growth there.'
 *   actionLabel='Review pitch'
 *   onAct={() => openThread('detroit-pitch')}
 *   onDismiss={() => dismissSuggestion(id)}
 * />
 * ```
 */
export function SuggestionCard({
  title,
  body,
  actionLabel,
  onAct,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
}: SuggestionCardProps) {
  return (
    <article
      className={cn(
        'group/sug relative w-full rounded-[18px] overflow-hidden border border-white/[0.05] bg-(--linear-app-content-surface)',
        className
      )}
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.18), 0 16px 40px -16px rgba(0,0,0,0.4)',
        transition: `transform 240ms ${EASE_CINEMATIC}, box-shadow 240ms ${EASE_CINEMATIC}`,
      }}
    >
      <div className='px-7 py-6'>
        <h2 className='text-[17px] font-semibold leading-[1.3] text-primary-token tracking-[-0.024em]'>
          {title}
        </h2>
        <p className='mt-2 text-[12.5px] leading-[1.6] text-tertiary-token tracking-[-0.003em]'>
          {body}
        </p>

        <div className='mt-6 flex items-center justify-end gap-1'>
          {onDismiss && (
            <button
              type='button'
              onClick={onDismiss}
              className='inline-flex items-center h-7 px-3 rounded-full text-[11.5px] text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
            >
              {dismissLabel}
            </button>
          )}
          <button
            type='button'
            onClick={onAct}
            disabled={!onAct}
            className='inline-flex items-center gap-1.5 h-7 px-3.5 rounded-full text-[12px] font-medium bg-white text-black hover:brightness-110 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all duration-150 ease-out'
          >
            {actionLabel}
            <ArrowRight className='h-3 w-3' strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  );
}
