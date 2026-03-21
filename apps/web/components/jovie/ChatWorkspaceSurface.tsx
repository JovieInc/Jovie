'use client';

import type { ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <div className='flex h-full min-h-0 flex-col px-3 pb-3 pt-2 sm:px-4 sm:pb-4'>
      <ContentSurfaceCard
        className={cn(
          'relative flex min-h-0 flex-1 overflow-hidden rounded-[18px] border-(--linear-app-frame-seam)',
          'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%),color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
          className
        )}
      >
        <div className='pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent)]' />
        <div className='relative flex min-h-0 flex-1 flex-col'>{children}</div>
      </ContentSurfaceCard>
    </div>
  );
}
