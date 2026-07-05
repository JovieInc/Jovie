'use client';

import Image from 'next/image';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const ZOOM_SCALE = 2.25;
const LENS_SIZE_PX = 112;
const POPOVER_WIDTH_PX = 240;
const POPOVER_HEIGHT_PX = 300;

export interface LibraryArtworkHoverZoomProps {
  readonly imageUrl: string;
  readonly title: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function LibraryArtworkHoverZoom({
  imageUrl,
  title,
  className,
  children,
}: LibraryArtworkHoverZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [focusRatio, setFocusRatio] = useState({ x: 0.5, y: 0.5 });
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.('(pointer: coarse)');
    if (!mediaQuery) return undefined;

    const updatePointerMode = () => {
      setCoarsePointer(mediaQuery.matches);
    };

    updatePointerMode();
    mediaQuery.addEventListener('change', updatePointerMode);
    return () => mediaQuery.removeEventListener('change', updatePointerMode);
  }, []);

  const updateFocus = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = clampRatio((event.clientX - rect.left) / rect.width);
    const y = clampRatio((event.clientY - rect.top) / rect.height);
    setFocusRatio({ x, y });

    const viewportWidth = globalThis.innerWidth ?? 0;
    const preferLeft = rect.right + POPOVER_WIDTH_PX + 16 > viewportWidth;
    const left = preferLeft
      ? Math.max(8, rect.left - POPOVER_WIDTH_PX - 12)
      : rect.right + 12;
    const top = Math.max(
      8,
      Math.min(rect.top, (globalThis.innerHeight ?? 0) - POPOVER_HEIGHT_PX - 8)
    );
    setPopoverPosition({ top, left });
  }, []);

  const showZoom = isHovering && !coarsePointer;

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full', className)}
      data-testid='library-artwork-hover-zoom'
    >
      {children}
      {!coarsePointer ? (
        <div
          role='slider'
          aria-label={`Zoom preview for ${title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(focusRatio.x * 100)}
          tabIndex={-1}
          data-testid='library-artwork-hover-zoom-surface'
          className='absolute inset-0 z-10'
          onMouseEnter={event => {
            setIsHovering(true);
            updateFocus(event);
          }}
          onMouseMove={updateFocus}
          onMouseLeave={() => {
            setIsHovering(false);
            setPopoverPosition(null);
          }}
        />
      ) : null}
      {showZoom ? (
        <div
          aria-hidden='true'
          className='pointer-events-none absolute z-20 rounded-full border border-subtle bg-surface-1 opacity-35 shadow-card backdrop-blur-sm'
          style={{
            width: LENS_SIZE_PX,
            height: LENS_SIZE_PX,
            left: `calc(${focusRatio.x * 100}% - ${LENS_SIZE_PX / 2}px)`,
            top: `calc(${focusRatio.y * 100}% - ${LENS_SIZE_PX / 2}px)`,
          }}
        />
      ) : null}
      {showZoom && popoverPosition
        ? createPortal(
            <div
              role='presentation'
              aria-hidden='true'
              data-testid='library-artwork-hover-zoom-popover'
              className='pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-card'
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
                width: POPOVER_WIDTH_PX,
                height: POPOVER_HEIGHT_PX,
              }}
            >
              <div className='relative h-full w-full'>
                <Image
                  src={imageUrl}
                  alt=''
                  fill
                  sizes={`${POPOVER_WIDTH_PX}px`}
                  className='object-cover'
                  style={{
                    transform: `scale(${ZOOM_SCALE})`,
                    transformOrigin: `${focusRatio.x * 100}% ${focusRatio.y * 100}%`,
                  }}
                  unoptimized
                />
              </div>
              <span className='sr-only'>{`Zoomed preview of ${title}`}</span>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
