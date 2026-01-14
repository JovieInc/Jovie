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
        'shrink-0 h-full bg-surface-1 border-l border-subtle',
        'transition-[width,opacity] duration-300 ease-out',
        isOpen
          ? 'opacity-100 visible'
          : 'opacity-0 pointer-events-none invisible w-0 border-l-0'
      )}
      style={{ width: isOpen ? width : 0 }}
    >
      <div className='h-full overflow-y-auto'>{children}</div>
    </aside>
  );
}
