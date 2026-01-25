'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TruncatedTextProps {
  /** The text content to display */
  children: string;
  /** Number of lines before truncation (1 or 2) */
  lines?: 1 | 2;
  /** Additional class names */
  className?: string;
  /** Tooltip placement */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  /** Tooltip alignment */
  tooltipAlign?: 'start' | 'center' | 'end';
  /** Always show tooltip regardless of truncation */
  alwaysShowTooltip?: boolean;
}

/**
 * TruncatedText - Text with automatic truncation and tooltip
 *
 * Detects when text is truncated and shows a tooltip with the full content.
 * Supports single-line or two-line truncation.
 *
 * @example
 * // Single line truncation with auto-tooltip
 * <TruncatedText className="text-sm font-medium">
 *   This is a very long title that will be truncated
 * </TruncatedText>
 *
 * @example
 * // Two-line truncation with fixed height
 * <TruncatedText lines={2} className="min-h-[2.5rem]">
 *   This is a longer description that spans multiple lines
 * </TruncatedText>
 */
export const TruncatedText = memo(function TruncatedText({
  children,
  lines = 1,
  className,
  tooltipSide = 'top',
  tooltipAlign = 'start',
  alwaysShowTooltip = false,
}: TruncatedTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const checkTruncation = () => {
      // For single line: compare scrollWidth > clientWidth
      // For multi-line: compare scrollHeight > clientHeight
      const truncated =
        lines === 1
          ? el.scrollWidth > el.clientWidth
          : el.scrollHeight > el.clientHeight;
      setIsTruncated(prev => (prev === truncated ? prev : truncated));
    };

    checkTruncation();

    // Re-check when element size changes (e.g., column resize, window resize)
    const resizeObserver = new ResizeObserver(checkTruncation);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, [children, lines]);

  const textElement = (
    <span
      ref={textRef}
      className={cn(lines === 1 ? 'line-clamp-1' : 'line-clamp-2', className)}
    >
      {children}
    </span>
  );

  const showTooltip = alwaysShowTooltip || isTruncated;

  if (!showTooltip) {
    return textElement;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{textElement}</TooltipTrigger>
      <TooltipContent side={tooltipSide} align={tooltipAlign}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
});
