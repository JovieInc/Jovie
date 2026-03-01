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
          'rounded-md -mx-2 px-2 py-1 hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[0.1s] cursor-pointer',
        className
      )}
      style={gridStyle}
    >
      <div className='pt-px text-[13px] leading-normal text-quaternary-token'>
        {label}
      </div>
      <div className='min-w-0 text-[13px] leading-normal text-secondary-token'>
        {value}
      </div>
    </Wrapper>
  );
}
