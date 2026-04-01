'use client';

import type { ReactNode } from 'react';
import { PageShell } from '@/components/organisms/PageShell';

interface ChatWorkspaceSurfaceProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ChatWorkspaceSurface({
  children,
  className,
}: ChatWorkspaceSurfaceProps) {
  return (
    <PageShell
      maxWidth='wide'
      frame='none'
      contentPadding='none'
      scroll='page'
      className={className}
    >
      {children}
    </PageShell>
  );
}
