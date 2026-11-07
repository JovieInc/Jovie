'use client';

import {
  type ComponentPropsWithoutRef,
  type ElementType,
  useLayoutEffect,
  useRef,
} from 'react';
import { cn } from '@/lib/utils';
import './DisplayText.css';

type DisplayTextProps<T extends ElementType> = {
  readonly as?: T;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

/**
 * The shared display-type primitive. Large glyphs carry a left side-bearing,
 * so a box that sits on a column line still reads as off (grid guide rule 5:
 * align the ink, not the box). After the real font loads and on resize this
 * measures the first glyph with canvas `actualBoundingBoxLeft` against the
 * element's computed font and pulls the box left by that amount. The
 * correction lives here, never at a call site.
 */
export function DisplayText<T extends ElementType = 'h2'>({
  as,
  className,
  children,
  ...rest
}: DisplayTextProps<T>) {
  const Tag = (as ?? 'h2') as ElementType;
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const canvas = document.createElement('canvas').getContext('2d');
    const measure = () => {
      if (cancelled || !canvas) return;
      const first = (element.textContent ?? '').trim().charAt(0);
      if (!first) return;
      const style = getComputedStyle(element);
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // Negative when the ink starts right of the origin (a side-bearing).
      const left = canvas.measureText(first).actualBoundingBoxLeft;
      element.style.setProperty(
        '--display-ink-shift',
        `${Math.min(0, left).toFixed(2)}px`
      );
    };
    measure();
    document.fonts?.ready?.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  return (
    <Tag ref={ref} className={cn('display-text', className)} {...rest}>
      {children}
    </Tag>
  );
}
