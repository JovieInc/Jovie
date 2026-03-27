'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface UseTextareaAutosizeOptions {
  /** Current textarea value */
  value: string;
  /** Minimum height in pixels */
  minHeight: number;
  /** Maximum height in pixels */
  maxHeight: number;
  /** Ref to the actual textarea element for width measurement */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface UseTextareaAutosizeReturn {
  /** The measured height to animate the textarea to */
  measuredHeight: number;
  /** Whether the textarea is at max height (should show overflow scroll) */
  isAtMaxHeight: boolean;
  /** Ref to attach to the textarea's parent container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The hidden measurement div ref */
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
  textareaRef,
}: UseTextareaAutosizeOptions): UseTextareaAutosizeReturn {
  const [measuredHeight, setMeasuredHeight] = useState(minHeight);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenDivRef = useRef<HTMLDivElement>(null);

  // Store current measurement inputs in refs so the ResizeObserver callback
  // always reads the latest values (avoids stale closure on width change).
  const valueRef = useRef(value);
  const minHeightRef = useRef(minHeight);
  const maxHeightRef = useRef(maxHeight);
  useEffect(() => {
    valueRef.current = value;
    minHeightRef.current = minHeight;
    maxHeightRef.current = maxHeight;
  }, [value, minHeight, maxHeight]);

  const remeasure = () => {
    const hiddenDiv = hiddenDivRef.current;
    if (!hiddenDiv) return;

    hiddenDiv.textContent = valueRef.current + '\n';
    const scrollHeight = hiddenDiv.scrollHeight;
    const clamped = Math.max(
      minHeightRef.current,
      Math.min(scrollHeight, maxHeightRef.current)
    );
    setMeasuredHeight(clamped);
  };

  // Measure on value change
  useLayoutEffect(remeasure, [value, minHeight, maxHeight]);

  // Sync hidden div width with the textarea's actual width (not the container row)
  // and remeasure height when width changes (responsive resize, sidebar toggle, etc.)
  useEffect(() => {
    const textarea = textareaRef.current;
    const hiddenDiv = hiddenDivRef.current;
    if (!textarea || !hiddenDiv) return;

    if (typeof ResizeObserver === 'undefined') return;

    const syncWidthAndRemeasure = () => {
      const width = textarea.getBoundingClientRect().width;
      if (width > 0) {
        hiddenDiv.style.width = `${width}px`;
        remeasure();
      }
    };

    // Initial sync
    syncWidthAndRemeasure();

    const observer = new ResizeObserver(syncWidthAndRemeasure);
    observer.observe(textarea);

    return () => observer.disconnect();
  }, [textareaRef]);

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
