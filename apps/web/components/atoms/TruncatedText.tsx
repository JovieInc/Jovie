'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface TruncatedTextProps {
  readonly children: string;
  readonly lines?: 1 | 2;
  readonly className?: string;
  readonly tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  readonly tooltipAlign?: 'start' | 'center' | 'end';
  readonly alwaysShowTooltip?: boolean;
}

export const TruncatedText = memo(function TruncatedText({
  children,
  lines = 1,
  className,
  tooltipSide = 'top',
  tooltipAlign = 'start',
  alwaysShowTooltip = false,
}: TruncatedTextProps) {
  const textElement = (
    <span
      className={cn(lines === 1 ? 'line-clamp-1' : 'line-clamp-2', className)}
    >
      {children}
    </span>
  );

  if (!alwaysShowTooltip) {
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
