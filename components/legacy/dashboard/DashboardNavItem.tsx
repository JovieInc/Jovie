import React from 'react';
import { cn } from '@/lib/utils';
import { DashboardButton } from '@/components/dashboard/atoms/DashboardButton';

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
}: DashboardNavItemProps) {
  // Use filled icon for active state if available, otherwise use regular icon
  const ActiveIcon = isActive && FilledIcon ? FilledIcon : Icon;

  const navButton = (
    <DashboardButton
      variant='nav-item'
      isActive={isActive}
      onClick={onClick}
      className={cn(collapsed && 'justify-center', className)}
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
      {!collapsed && badge && (
        <span className='ml-auto inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-border'>
          {badge}
        </span>
      )}
      {!collapsed && isPro && (
        <span className='ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-border'>
          Pro
        </span>
      )}
    </DashboardButton>
  );

  // Add tooltip wrapper for collapsed state
  if (collapsed) {
    return (
      <div className='group relative' title={label}>
        {navButton}
        {/* Tooltip */}
        <div className='absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-surface-0 text-primary border border-border text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg'>
          {label}
          <div className='absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-surface-0 border-l border-t border-border rotate-45'></div>
        </div>
      </div>
    );
  }

  return navButton;
}
