'use client';

import { type ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerPropertyRowProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly labelWidth?: number;
  readonly interactive?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

export function DrawerPropertyRow({
  label,
  value,
  labelWidth = 88,
  interactive = false,
  onClick,
  className,
}: DrawerPropertyRowProps) {
  const Wrapper = interactive ? 'button' : 'div';

  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }),
    [labelWidth]
  );

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'grid items-center gap-1 w-full min-h-[28px] text-left',
        interactive &&
          'rounded -mx-1.5 px-1.5 hover:bg-white/[0.02] transition-colors duration-100 cursor-pointer',
        className
      )}
      style={gridStyle}
    >
      <span className='text-[13px] font-[450] leading-tight text-tertiary-token'>
        {label}
      </span>
      <span className='min-w-0 text-[13px] leading-tight text-secondary-token'>
        {value}
      </span>
    </Wrapper>
  );
}
