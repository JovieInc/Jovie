'use client';

import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';

type DrawerPropertyRowStyle = CSSProperties & {
  gridTemplateColumns: string;
};

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
  labelWidth,
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
      container: 'min-h-[22px] gap-2 rounded-[6px] px-1 py-px',
      label: 'text-[11px] leading-[15px] tracking-normal',
      value: 'text-[12px] leading-[16px] tracking-normal',
    },
    md: {
      container: 'min-h-[24px] gap-2 rounded-[6px] px-1 py-0.5',
      label: 'text-[11px] leading-[15px] tracking-normal',
      value: 'text-[12px] leading-[16px] tracking-normal',
    },
  } as const;

  const styles = sizeClasses[size];

  const gridStyle = useMemo<DrawerPropertyRowStyle>(
    () => ({
      gridTemplateColumns:
        typeof labelWidth === 'number'
          ? `${labelWidth}px minmax(0, 1fr)`
          : 'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
    }),
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
          'font-[500] text-quaternary-token',
          styles.label,
          labelClassName
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 font-[460] text-primary-token',
          styles.value,
          valueClassName
        )}
      >
        {value}
      </span>
    </Wrapper>
  );
}
