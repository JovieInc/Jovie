'use client';

import { type ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerPropertyRowProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly labelWidth?: number;
  readonly interactive?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

export function DrawerPropertyRow({
  label,
  value,
  labelWidth = 96,
  interactive = false,
  onClick,
  className,
}: DrawerPropertyRowProps) {
  const Wrapper = interactive ? 'button' : 'div';

  // Memoize dynamic style object to avoid creating new object on each render
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }),
    [labelWidth]
  );

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'grid items-start gap-2 w-full text-left',
        interactive &&
          'rounded-md -mx-2 px-2 py-1.5 hover:bg-surface-2 transition-colors cursor-pointer',
        className
      )}
      style={gridStyle}
    >
      <div className='pt-0.5 text-xs text-secondary-token'>{label}</div>
      <div className='min-w-0 text-xs text-primary-token'>{value}</div>
    </Wrapper>
  );
}
