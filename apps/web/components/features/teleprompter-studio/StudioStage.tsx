import type { Ref } from 'react';
import { cn } from '@/lib/utils';

const GRID_CELLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;

interface StudioStageProps {
  readonly videoRef?: Ref<HTMLVideoElement>;
  /** Full-strength camera for framing; otherwise dim behind the words. */
  readonly peek: boolean;
  /** Dimmer still while Jovie asks a question between takes. */
  readonly between: boolean;
  readonly grid: boolean;
}

/**
 * The ghost camera (mirrored, dim, with an optional thirds grid) and the ring
 * light around it. The ring reads `--studio-ring-*` from the studio root.
 */
export function StudioStage({
  videoRef,
  peek,
  between,
  grid,
}: StudioStageProps) {
  return (
    <>
      <div
        className='absolute overflow-hidden rounded-(--system-b-radius-panel-inner)'
        style={{ inset: 'var(--studio-ring-width)' }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={cn(
            'h-full w-full -scale-x-100 object-cover transition-opacity duration-slow ease-out motion-reduce:transition-none',
            peek ? 'opacity-100' : between ? 'opacity-15' : 'opacity-30'
          )}
          data-testid='teleprompter-studio-camera'
        />
        {grid ? (
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3'
          >
            {GRID_CELLS.map(cell => (
              <span key={cell} className='border border-on-media/15' />
            ))}
          </div>
        ) : null}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/60'
        />
      </div>

      {/* The ring light: the only bright thing on screen. */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          boxShadow:
            'inset 0 0 0 var(--studio-ring-width) rgb(var(--studio-ring-rgb) / var(--studio-ring-level)), inset 0 0 calc(var(--studio-ring-width) * 1.6) calc(var(--studio-ring-width) * 0.8) rgb(var(--studio-ring-rgb) / calc(var(--studio-ring-level) * 0.5))',
        }}
        data-testid='teleprompter-studio-ring'
      />
    </>
  );
}
