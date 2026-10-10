'use client';

import { type ComponentProps, useRef } from 'react';
import { cn } from '@/lib/utils';
import { SHELL_RAIL_STAGE } from './rail-motion';
import { useRailFocusReturn } from './useRailFocusReturn';

/** Staged chrome keeps its visual exit but leaves keyboard/AX navigation
 * immediately when collapsed. Compact icon navigation remains reachable. */
export function RailStagedContent({
  hidden,
  stage = true,
  className,
  ...props
}: ComponentProps<'div'> & {
  readonly hidden: boolean;
  readonly stage?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useRailFocusReturn(ref, hidden, 'left');
  return (
    <div
      {...props}
      ref={ref}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={cn(stage && SHELL_RAIL_STAGE, className)}
    />
  );
}
