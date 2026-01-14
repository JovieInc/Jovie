'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../table.styles';

interface ContextMenuSubmenuProps {
  /**
   * Label for the submenu trigger (e.g., "Copy")
   */
  label: string;

  /**
   * Icon to show before the label
   */
  icon?: React.ReactNode;

  /**
   * Submenu items
   */
  children: React.ReactNode;

  /**
   * Additional CSS classes for the trigger
   */
  className?: string;
}

/**
 * ContextMenuSubmenu - Submenu for context menu (e.g., "Copy >" submenu)
 *
 * Features:
 * - Hover to open submenu
 * - Chevron icon indicates submenu
 * - Positioned to the right of parent menu
 * - Smooth animations with ease-out timing
 *
 * Example:
 * ```tsx
 * <ContextMenuSubmenu label="Copy">
 *   <ContextMenuItem onClick={() => copy(data.isrc)}>
 *     Copy ISRC
 *   </ContextMenuItem>
 *   <ContextMenuItem onClick={() => copy(data.link)}>
 *     Copy Link
 *   </ContextMenuItem>
 * </ContextMenuSubmenu>
 * ```
 */
export function ContextMenuSubmenu({
  label,
  icon,
  children,
  className,
}: ContextMenuSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Submenu requires hover handlers
    // biome-ignore lint/a11y/noStaticElementInteractions: Submenu requires hover handlers
    <div
      className='relative'
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Submenu Trigger */}
      <button
        className={cn(
          'flex w-full items-center justify-between gap-2',
          'px-2 py-1.5 text-left text-[13px]',
          'hover:bg-surface-2 rounded',
          'transition-colors duration-150',
          className
        )}
        type='button'
      >
        <span className='flex items-center gap-2'>
          {icon && <span className='text-secondary-token'>{icon}</span>}
          <span>{label}</span>
        </span>
        <ChevronRight className='h-3.5 w-3.5 text-tertiary-token' />
      </button>

      {/* Submenu Content */}
      {isOpen && (
        <div
          className={cn(
            'absolute left-full top-0 ml-1',
            'min-w-[160px] rounded-md',
            'bg-surface-1 shadow-lg border border-subtle',
            'p-1',
            'animate-in slide-in-from-left-2 fade-in',
            'duration-150'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface ContextMenuItemProps {
  /**
   * Click handler
   */
  onClick: () => void;

  /**
   * Icon to show before the label
   */
  icon?: React.ReactNode;

  /**
   * Item label
   */
  children: React.ReactNode;

  /**
   * Whether this is a destructive action (shows in red)
   */
  destructive?: boolean;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * ContextMenuItem - Individual item in a context menu or submenu
 */
export function ContextMenuItem({
  onClick,
  icon,
  children,
  destructive,
  className,
}: ContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2',
        'px-2 py-1.5 text-left text-[13px]',
        'hover:bg-surface-2 rounded',
        'transition-colors duration-150',
        destructive && 'text-red-500 hover:bg-red-50',
        className
      )}
      type='button'
    >
      {icon && <span className='text-secondary-token'>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

interface ContextMenuSeparatorProps {
  className?: string;
}

/**
 * ContextMenuSeparator - Visual separator between menu sections
 */
export function ContextMenuSeparator({ className }: ContextMenuSeparatorProps) {
  return <div className={cn('my-1 h-px bg-subtle', className)} aria-hidden />;
}
