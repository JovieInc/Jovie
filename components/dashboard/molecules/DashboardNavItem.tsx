import React from 'react';
import { cn } from '@/lib/utils';
import { DashboardButton } from '../atoms/DashboardButton';

interface DashboardNavItemProps {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  filledIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isActive?: boolean;
  isPro?: boolean;
  onClick: () => void;
  collapsed?: boolean;
  className?: string;
  badge?: string;
  shortcutKey?: string; // e.g., "1", "2", etc.
  shortcutAliases?: string[]; // e.g., ["⌘L", "⌘G"]
}

export function DashboardNavItem({
  label,
  icon: Icon,
  filledIcon: FilledIcon,
  isActive,
  isPro,
  onClick,
  collapsed,
  className,
  badge,
  shortcutKey,
  shortcutAliases = [],
}: DashboardNavItemProps) {
  // Use filled icon for active state if available, otherwise use regular icon
  const ActiveIcon = isActive && FilledIcon ? FilledIcon : Icon;

  // Build aria-keyshortcuts string for accessibility
  const ariaKeyShortcuts = [
    shortcutKey ? `cmd+${shortcutKey}` : null,
    ...shortcutAliases
  ].filter(Boolean).join(' ');

  const navButton = (
    <DashboardButton
      variant='nav-item'
      isActive={isActive}
      onClick={onClick}
      className={cn(collapsed && 'justify-center', className)}
      aria-keyshortcuts={ariaKeyShortcuts || undefined}
    >
      <ActiveIcon
        className={cn(
          'h-6 w-6 shrink-0',
          isActive
            ? 'text-accent-token' // Use accent color for active items
            : 'text-secondary group-hover:text-primary'
        )}
        aria-hidden={true}
      />
      {!collapsed && (
        <span className='flex-1 text-left font-medium'>{label}</span>
      )}
      
      {/* Shortcut key badge (expanded sidebar, on hover) */}
      {!collapsed && shortcutKey && (
        <span 
          className={cn(
            'ml-auto inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium transition-opacity duration-200',
            'text-tertiary bg-surface-1 border border-subtle',
            'opacity-0 group-hover:opacity-100'
          )}
          aria-hidden="true"
        >
          {shortcutKey}
        </span>
      )}
      
      {!collapsed && badge && (
        <span className='ml-auto inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-subtle'>
          {badge}
        </span>
      )}
      {!collapsed && isPro && (
        <span className='ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-subtle'>
          Pro
        </span>
      )}
    </DashboardButton>
  );

  // Add tooltip wrapper for collapsed state
  if (collapsed) {
    // Build tooltip content with shortcut
    const tooltipContent = [
      label,
      shortcutKey ? `⌘${shortcutKey}` : null,
      ...shortcutAliases
    ].filter(Boolean).join(' — ');

    return (
      <div className='group relative' title={tooltipContent}>
        {navButton}
        {/* Tooltip with shortcuts */}
        <div className='absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg'>
          <div className='flex items-center gap-2'>
            <span>{label}</span>
            {(shortcutKey || shortcutAliases.length > 0) && (
              <span className='text-gray-300 text-xs'>
                {shortcutKey && `⌘${shortcutKey}`}
                {shortcutKey && shortcutAliases.length > 0 && ', '}
                {shortcutAliases.join(', ')}
              </span>
            )}
          </div>
          <div className='absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45'></div>
        </div>
      </div>
    );
  }

  return navButton;
}
