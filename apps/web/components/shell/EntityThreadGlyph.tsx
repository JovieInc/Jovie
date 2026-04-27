'use client';

import { Sparkles } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface EntityThreadGlyphProps {
  /** Used as the screen-reader-only label so assistive tech can read the active thread. */
  readonly threadTitle: string;
  /** Called when the user clicks to open the thread. The click stops propagation so it doesn't bubble to a row's onClick. */
  readonly onOpen: () => void;
  readonly tooltipLabel?: string;
}

/**
 * EntityThreadGlyph — small "Jovie is working on this" glyph that sits
 * inline next to an entity row (release / track / contact) when a
 * running thread is linked to that entity. Click to open the running
 * thread in the canvas.
 *
 * Composes the `.anim-calm-halo` global utility for the breathing halo
 * around the Sparkles icon. The animation gates on
 * `prefers-reduced-motion: reduce`.
 *
 * @example
 * ```tsx
 * {runningThread && (
 *   <EntityThreadGlyph
 *     threadTitle={runningThread.title}
 *     onOpen={() => openThread(runningThread.id)}
 *   />
 * )}
 * ```
 */
export function EntityThreadGlyph({
  threadTitle,
  onOpen,
  tooltipLabel = 'Jovie working — open thread',
}: EntityThreadGlyphProps) {
  return (
    <Tooltip label={tooltipLabel}>
      <button
        type='button'
        onClick={e => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label='Open running thread'
        className='shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-cyan-300/85 hover:text-cyan-200 hover:bg-surface-1/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
      >
        <span className='relative inline-grid place-items-center h-3 w-3'>
          <span
            aria-hidden='true'
            className='absolute inset-0 rounded-full bg-cyan-300/30 anim-calm-halo'
          />
          <Sparkles className='relative h-3 w-3' strokeWidth={2.25} />
        </span>
        <span className='sr-only'>{threadTitle}</span>
      </button>
    </Tooltip>
  );
}
