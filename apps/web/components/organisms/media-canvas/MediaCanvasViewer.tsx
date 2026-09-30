'use client';

import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface MediaCanvasItem {
  readonly kind: 'image' | 'video';
  readonly src: string;
  readonly poster?: string;
  readonly alt: string;
  readonly label?: string;
}

export interface MediaCanvasViewerProps {
  readonly items: readonly MediaCanvasItem[];
  /** Index of the open item, or null when the viewer is closed. */
  readonly index: number | null;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}

/**
 * Full-canvas photo and video viewer. A native modal <dialog> gives focus
 * containment, Escape and the top layer; ←/→ step through items and the
 * filmstrip jumps. Video uses native controls so Space/scrub work as usual.
 */
export function MediaCanvasViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: MediaCanvasViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = index !== null && items.length > 0;
  const current = open ? items[Math.min(index, items.length - 1)] : undefined;
  const at = open ? Math.min(index, items.length - 1) : 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const step = useCallback(
    (delta: number) => {
      const next = at + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [at, items.length, onIndexChange]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      // Let a focused video keep its own arrow-key seeking.
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      }
    },
    [step]
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={
        current
          ? `${current.alt} (${at + 1} of ${items.length})`
          : 'Media viewer'
      }
      data-testid='media-canvas-viewer'
      onKeyDown={onKeyDown}
      onClose={onClose}
      className='fixed inset-0 m-0 h-dvh max-h-dvh w-dvw max-w-none border-0 bg-black p-0 text-white dark:bg-black dark:text-white backdrop:bg-black/70'
    >
      {current ? (
        <div className='flex h-full flex-col'>
          <div className='flex h-12 shrink-0 items-center gap-3 px-4'>
            <p className='min-w-0 flex-1 truncate text-xs text-white/70'>
              {current.label ?? current.alt}
            </p>
            <span className='text-xs tabular-nums text-white/50'>
              {at + 1} / {items.length}
            </span>
            <button
              type='button'
              onClick={onClose}
              aria-label='Close Viewer'
              className='grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40'
            >
              <X className='size-4' aria-hidden='true' />
            </button>
          </div>

          <div className='relative flex min-h-0 flex-1 items-center justify-center px-14'>
            {current.kind === 'video' ? (
              // biome-ignore lint/a11y/useMediaCaption: evidence recordings have no caption track.
              <video
                key={current.src}
                src={current.src}
                poster={current.poster}
                controls
                autoPlay
                playsInline
                className='max-h-full max-w-full rounded-md'
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- full-resolution evidence; next/image would resample it
              <img
                key={current.src}
                src={current.src}
                alt={current.alt}
                className='max-h-full max-w-full rounded-md object-contain'
              />
            )}
            <NavButton
              side='left'
              disabled={at === 0}
              onClick={() => step(-1)}
            />
            <NavButton
              side='right'
              disabled={at === items.length - 1}
              onClick={() => step(1)}
            />
          </div>

          {items.length > 1 ? (
            <div className='flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto px-4'>
              {items.map((item, i) => (
                <button
                  key={item.src}
                  type='button'
                  onClick={() => onIndexChange(i)}
                  aria-label={`Show ${item.alt}`}
                  aria-current={i === at || undefined}
                  className={cn(
                    'relative h-12 w-20 shrink-0 overflow-hidden rounded-md border transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                    i === at
                      ? 'border-white/80 opacity-100'
                      : 'border-white/10 opacity-50 hover:opacity-80'
                  )}
                >
                  <MediaThumb item={item} />
                </button>
              ))}
            </div>
          ) : null}

          {/* Warm the neighbours so stepping is instant. */}
          <div hidden>
            {[items[at - 1], items[at + 1]].map(item =>
              item?.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- hidden preload of the next evidence frame
                <img key={item.src} src={item.src} alt='' />
              ) : null
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  readonly side: 'left' | 'right';
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cn(
        'absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/8 text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-0',
        side === 'left' ? 'left-3' : 'right-3'
      )}
    >
      <Icon className='size-5' aria-hidden='true' />
    </button>
  );
}

/** Thumbnail with a play badge for video; shared by the viewer and callers. */
export function MediaThumb({
  item,
  fit = 'cover',
}: {
  readonly item: MediaCanvasItem;
  /** `contain` shows the whole frame (hero previews); `cover` fills (strips). */
  readonly fit?: 'cover' | 'contain';
}) {
  const still = item.kind === 'video' ? item.poster : item.src;
  return (
    <>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails of arbitrary evidence URLs
        <img
          src={still}
          alt=''
          loading='lazy'
          className={cn(
            'size-full',
            fit === 'contain' ? 'object-contain' : 'object-cover'
          )}
        />
      ) : (
        <span className='block size-full bg-white/5' />
      )}
      {item.kind === 'video' ? (
        <span className='absolute inset-0 grid place-items-center'>
          <span className='grid size-6 place-items-center rounded-full bg-black/60'>
            <Play
              className='size-3 fill-white text-white dark:text-white'
              aria-hidden='true'
            />
          </span>
        </span>
      ) : null}
    </>
  );
}
