'use client';

import { Copy, ExternalLink, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const ACTION_BUTTON_CLASS =
  'p-1 rounded hover:bg-sidebar-border text-sidebar-muted hover:text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring';

export interface SidebarLinkRowProps {
  icon: ReactNode;
  label: string;
  url: string;
  badge?: string;
  isEditable?: boolean;
  isRemoving?: boolean;
  onRemove?: () => void;
  className?: string;
  testId?: string;
}

export function SidebarLinkRow({
  icon,
  label,
  url,
  badge,
  isEditable = false,
  isRemoving = false,
  onRemove,
  className,
  testId,
}: SidebarLinkRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-md py-1.5 px-1 -mx-1 hover:bg-sidebar-surface-hover transition-colors',
        className
      )}
      data-testid={testId}
    >
      {/* Left: Icon + Label */}
      <div className='flex items-center gap-2 min-w-0'>
        <span className='shrink-0'>{icon}</span>
        <span className='text-sm text-sidebar-foreground truncate'>
          {label}
        </span>
        {badge && (
          <span className='text-[10px] text-sidebar-muted shrink-0'>
            {badge}
          </span>
        )}
      </div>

      {/* Right: Actions (visible on hover/focus) */}
      <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0'>
        <button
          type='button'
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Open ${label}`}
        >
          <ExternalLink className='h-4 w-4' aria-hidden='true' />
        </button>
        <button
          type='button'
          onClick={() => {
            if (!navigator.clipboard?.writeText) return;
            navigator.clipboard.writeText(url).catch(() => {
              // Silently fail - clipboard may not be available
            });
          }}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Copy ${label} link`}
        >
          <Copy className='h-4 w-4' aria-hidden='true' />
        </button>
        {isEditable && onRemove && (
          <button
            type='button'
            onClick={onRemove}
            disabled={isRemoving}
            className={cn(ACTION_BUTTON_CLASS, 'disabled:opacity-50')}
            aria-label={`Remove ${label}`}
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </button>
        )}
      </div>
    </div>
  );
}
