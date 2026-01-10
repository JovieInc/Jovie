'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface UnifiedDrawerProps {
  width?: number;
  children: ReactNode;
  onClose?: () => void;
  isOpen?: boolean;
}

/**
 * UnifiedDrawer - Single right-side drawer for all contact/aside panels
 *
 * Used for:
 * - Contact sidebar (admin creators page)
 * - Audience member sidebar (dashboard audience page)
 * - Preview panel (dashboard profile page)
 *
 * Replaces: ContactSidebar, AudienceMemberSidebar, PreviewPanel
 */
export function UnifiedDrawer({
  width = 360,
  children,
  onClose,
  isOpen = true,
}: UnifiedDrawerProps) {
  return (
    <aside
      className={cn(
        'fixed top-0 right-0 h-full bg-surface-2 border-l border-subtle z-40',
        'transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
      style={{ width }}
    >
      <div className='h-full overflow-y-auto'>{children}</div>
    </aside>
  );
}
