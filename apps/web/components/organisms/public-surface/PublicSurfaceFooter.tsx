'use client';

import { cn } from '@/lib/utils';

export interface PublicSurfaceFooterProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function PublicSurfaceFooter({
  children,
  className,
}: Readonly<PublicSurfaceFooterProps>) {
  return (
    <div
      className={cn(
        'shrink-0 pb-[max(env(safe-area-inset-bottom),8px)]',
        className
      )}
    >
      {children}
    </div>
  );
}
