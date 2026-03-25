'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ChatWorkspaceSurfaceProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ChatWorkspaceSurface({
  children,
  className,
}: ChatWorkspaceSurfaceProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}
