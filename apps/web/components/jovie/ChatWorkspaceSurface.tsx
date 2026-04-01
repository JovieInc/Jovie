'use client';

import type { ReactNode } from 'react';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';

interface ChatWorkspaceSurfaceProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ChatWorkspaceSurface({
  children,
  className,
}: ChatWorkspaceSurfaceProps) {
  return (
    <AppShellContentPanel
      maxWidth='wide'
      frame='none'
      contentPadding='none'
      scroll='panel'
      className={className}
    >
      {children}
    </AppShellContentPanel>
  );
}
