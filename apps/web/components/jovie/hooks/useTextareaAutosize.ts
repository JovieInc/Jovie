'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface UseTextareaAutosizeOptions {
  /** Current textarea value */
  value: string;
  /** Minimum height in pixels */
  minHeight: number;
  /** Maximum height in pixels */
  maxHeight: number;
}

interface UseTextareaAutosizeReturn {
  /** The measured height to animate the textarea to */
  measuredHeight: number;
  /** Whether the textarea is at max height (should show overflow scroll) */
  isAtMaxHeight: boolean;
  /** Ref to attach to the textarea's parent container for width sync */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The hidden measurement div to render (portal-free, inside containerRef) */
  hiddenDivRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Measures textarea content height using a hidden div mirror.
 * Avoids the `height: 'auto'` trick that causes 1-frame layout collapse.
 *
 * The hidden div must be rendered inside `containerRef` with these styles:
 * - visibility: hidden
 * - position: absolute
 * - pointer-events: none
 * - height: auto
 * - Same font, padding, border, line-height, letter-spacing as textarea
 */
export function useTextareaAutosize({
  value,
  minHeight,
  maxHeight,
}: UseTextareaAutosizeOptions): UseTextareaAutosizeReturn {
  const [measuredHeight, setMeasuredHeight] = useState(minHeight);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenDivRef = useRef<HTMLDivElement>(null);

  // Measure on value change
  useLayoutEffect(() => {
    const hiddenDiv = hiddenDivRef.current;
    if (!hiddenDiv) return;

    // Set content with trailing newline to ensure last line is measured
    hiddenDiv.textContent = value + '\n';
    const scrollHeight = hiddenDiv.scrollHeight;
    const clamped = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    setMeasuredHeight(clamped);
  }, [value, minHeight, maxHeight]);

  // Sync hidden div width with container via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const hiddenDiv = hiddenDivRef.current;
    if (!container || !hiddenDiv) return;

    const syncWidth = () => {
      const width = container.getBoundingClientRect().width;
      hiddenDiv.style.width = `${width}px`;
    };

    // Initial sync
    syncWidth();

    const observer = new ResizeObserver(syncWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Reset height when value is cleared (e.g., after send)
  const prevValueRef = useRef(value);
  useLayoutEffect(() => {
    if (value === '' && prevValueRef.current !== '') {
      setMeasuredHeight(minHeight);
    }
    prevValueRef.current = value;
  }, [value, minHeight]);

  const isAtMaxHeight = measuredHeight >= maxHeight;

  return { measuredHeight, isAtMaxHeight, containerRef, hiddenDivRef };
}

/**
 * Style props to apply to the hidden measurement div.
 * Must match the textarea's text-affecting styles exactly.
 */
export const HIDDEN_DIV_STYLES: React.CSSProperties = {
  visibility: 'hidden',
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none',
  height: 'auto',
  overflow: 'hidden',
  // Text styles must match the textarea:
  fontSize: '14px',
  lineHeight: '24px',
  fontFamily: 'inherit',
  padding: '6px 0', // py-1.5
  boxSizing: 'border-box',
  wordWrap: 'break-word',
  whiteSpace: 'pre-wrap',
  letterSpacing: 'inherit',
  borderWidth: 0,
};
