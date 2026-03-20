'use client';

import { type ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerPropertyRowProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly labelWidth?: number;
  readonly size?: 'sm' | 'md';
  readonly align?: 'center' | 'start';
  readonly interactive?: boolean;
  readonly onClick?: () => void;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly className?: string;
}

export function DrawerPropertyRow({
  label,
  value,
  labelWidth = 76,
  size = 'md',
  align = 'center',
  interactive = false,
  onClick,
  labelClassName,
  valueClassName,
  className,
}: DrawerPropertyRowProps) {
  const Wrapper = interactive ? 'button' : 'div';

  const sizeClasses = {
    sm: {
      container: 'min-h-[20px] gap-1.5 rounded-[6px] px-1.5 py-px',
      label: 'text-[10px] leading-[13px] tracking-normal',
      value: 'text-[11.5px] leading-[15px]',
    },
    md: {
      container: 'min-h-[22px] gap-1.5 rounded-[6px] px-1.5 py-px',
      label: 'text-[10px] leading-[13px] tracking-normal',
      value: 'text-[11.5px] leading-[15px]',
    },
  } as const;

  const styles = sizeClasses[size];

  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }),
    [labelWidth]
  );

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'grid w-full text-left transition-[background-color] duration-150',
        align === 'start' ? 'items-start' : 'items-center',
        styles.container,
        interactive &&
          'cursor-pointer hover:bg-surface-1/80 focus-visible:bg-surface-1/80 focus-visible:outline-none',
        className
      )}
      style={gridStyle}
    >
      <span
        className={cn(
          'font-[500] text-tertiary-token',
          styles.label,
          labelClassName
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 text-secondary-token',
          styles.value,
          valueClassName
        )}
      >
        {value}
      </span>
    </Wrapper>
  );
}
