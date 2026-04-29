'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

export type ZoomParallaxImage = {
  readonly src: string;
  readonly alt?: string;
};

export interface ZoomParallaxProps {
  /** Array of images to be displayed in the parallax effect. Only the first 7 are rendered. */
  readonly images: readonly ZoomParallaxImage[];
  readonly className?: string;
  readonly priorityFirstImage?: boolean;
}

const IMAGE_POSITION_PRESETS = [
  '',
  '[&>div]:!-top-[30vh] [&>div]:!left-[5vw] [&>div]:!h-[30vh] [&>div]:!w-[35vw]',
  '[&>div]:!-top-[10vh] [&>div]:!-left-[25vw] [&>div]:!h-[45vh] [&>div]:!w-[20vw]',
  '[&>div]:!left-[27.5vw] [&>div]:!h-[25vh] [&>div]:!w-[25vw]',
  '[&>div]:!top-[27.5vh] [&>div]:!left-[5vw] [&>div]:!h-[25vh] [&>div]:!w-[20vw]',
  '[&>div]:!top-[27.5vh] [&>div]:!-left-[22.5vw] [&>div]:!h-[25vh] [&>div]:!w-[30vw]',
  '[&>div]:!top-[22.5vh] [&>div]:!left-[25vw] [&>div]:!h-[15vh] [&>div]:!w-[15vw]',
] as const;

const SCALE_PRESETS = [4, 5, 6, 5, 6, 8, 9] as const;

type ScrollParent = HTMLElement | Window;

function getScrollParent(node: HTMLElement | null): ScrollParent {
  let current = node?.parentElement ?? null;

  while (current) {
    const { overflowY } = globalThis.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }

  return window;
}

function isWindowScrollParent(
  scrollParent: ScrollParent
): scrollParent is Window {
  return scrollParent === window;
}

export function ZoomParallax({
  images,
  className,
  priorityFirstImage = true,
}: Readonly<ZoomParallaxProps>) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const visibleImages = images.slice(0, IMAGE_POSITION_PRESETS.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = itemRefs.current;
    const applyScale = (progress: number) => {
      items.forEach((item, index) => {
        if (!item) return;
        const scale = 1 + (SCALE_PRESETS[index] - 1) * progress;
        item.style.transform = `translate3d(0, 0, 0) scale(${scale})`;
      });
    };

    if (prefersReducedMotion) {
      applyScale(0);
      return;
    }

    const scrollParent = getScrollParent(container);

    const measureProgress = () => {
      const viewportHeight = isWindowScrollParent(scrollParent)
        ? window.innerHeight
        : scrollParent.clientHeight;

      const containerRect = container.getBoundingClientRect();
      const parentRect = isWindowScrollParent(scrollParent)
        ? { top: 0 }
        : scrollParent.getBoundingClientRect();
      const relativeTop = containerRect.top - parentRect.top;
      const maxTravel = Math.max(container.offsetHeight - viewportHeight, 1);
      const progress = Math.min(Math.max(-relativeTop / maxTravel, 0), 1);

      applyScale(progress);
      frameRef.current = null;
    };

    const requestMeasure = () => {
      if (frameRef.current !== null) return;
      frameRef.current = globalThis.requestAnimationFrame(measureProgress);
    };

    requestMeasure();

    const scrollTarget = isWindowScrollParent(scrollParent)
      ? window
      : scrollParent;
    scrollTarget.addEventListener('scroll', requestMeasure, { passive: true });
    globalThis.addEventListener('resize', requestMeasure, { passive: true });

    return () => {
      scrollTarget.removeEventListener('scroll', requestMeasure);
      globalThis.removeEventListener('resize', requestMeasure);

      if (frameRef.current !== null) {
        globalThis.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div ref={containerRef} className={cn('relative h-[300vh]', className)}>
      <div className='sticky top-0 h-screen overflow-hidden'>
        {visibleImages.map(({ src, alt }, index) => (
          <div
            key={alt ? `${src}-${alt}` : src}
            ref={node => {
              itemRefs.current[index] = node;
            }}
            className={cn(
              'absolute top-0 flex h-full w-full items-center justify-center will-change-transform',
              IMAGE_POSITION_PRESETS[index]
            )}
          >
            <div className='relative h-[25vh] w-[25vw] overflow-hidden'>
              <Image
                src={src}
                alt={alt ?? `Parallax image ${index + 1}`}
                fill
                priority={priorityFirstImage && index === 0}
                sizes='(max-width: 640px) 65vw, (max-width: 1024px) 40vw, 25vw'
                className='object-cover'
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
