'use client';

import { cn } from '@/lib/utils';

export interface PublicSurfaceHeaderProps {
  readonly leftSlot?: React.ReactNode;
  readonly rightSlot?: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly className?: string;
}

export function PublicSurfaceHeader({
  leftSlot,
  rightSlot,
  children,
  className,
}: Readonly<PublicSurfaceHeaderProps>) {
  return (
    <div
      className={cn(
        'relative z-10 flex items-center justify-between gap-4',
        className
      )}
    >
      <div className='flex items-center'>{leftSlot}</div>
      {children ? <div className='flex-1'>{children}</div> : null}
      <div className='flex items-center justify-end'>{rightSlot}</div>
    </div>
  );
}
