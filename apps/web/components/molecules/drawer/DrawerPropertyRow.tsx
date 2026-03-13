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
        'grid w-full min-h-[30px] items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-[background-color,box-shadow,border-color] duration-150',
        interactive &&
          'cursor-pointer hover:bg-(--linear-bg-surface-1) focus-visible:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        className
      )}
      style={gridStyle}
    >
      <span className='text-[11px] font-[510] leading-[14px] tracking-[-0.01em] text-(--linear-text-tertiary)'>
        {label}
      </span>
      <span className='min-w-0 text-[13px] leading-[17px] text-(--linear-text-secondary)'>
        {value}
      </span>
    </Wrapper>
  );
}
