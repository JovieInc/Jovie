'use client';

import {
  ChevronDownIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressiveDisclosureProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'subtle' | 'bordered' | 'highlighted';
  level?: 'primary' | 'secondary' | 'tertiary';
  showCount?: number;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function ProgressiveDisclosure({
  trigger,
  children,
  defaultOpen = false,
  variant = 'subtle',
  level = 'primary',
  showCount,
  className,
  triggerClassName,
  contentClassName,
}: ProgressiveDisclosureProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const getVariantClasses = () => {
    switch (variant) {
      case 'bordered':
        return 'border border-sidebar-border rounded-lg';
      case 'highlighted':
        return 'bg-sidebar-accent/50 rounded-lg border border-sidebar-border';
      case 'subtle':
      default:
        return '';
    }
  };

  const getLevelClasses = () => {
    switch (level) {
      case 'secondary':
        return 'text-sm';
      case 'tertiary':
        return 'text-xs';
      case 'primary':
      default:
        return '';
    }
  };

  return (
    <div className={cn('space-y-1', getVariantClasses(), className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between w-full p-2 text-left transition-all duration-200',
          'hover:bg-sidebar-accent rounded-md group',
          getLevelClasses(),
          triggerClassName
        )}
      >
        <div className='flex items-center gap-2'>
          {trigger}
          {showCount !== undefined && (
            <span className='text-xs text-sidebar-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-full'>
              {showCount}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-sidebar-muted-foreground transition-transform duration-200',
            isOpen ? 'rotate-180' : 'rotate-0'
          )}
        />
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className={cn('p-2 space-y-2', contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

// Smart section that shows/hides based on usage or importance
interface SmartSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  importance?: 'high' | 'medium' | 'low';
  usageFrequency?: 'frequent' | 'occasional' | 'rare';
  showHelp?: boolean;
  helpText?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export function SmartSection({
  title,
  description,
  children,
  importance = 'medium',
  usageFrequency = 'occasional',
  showHelp = false,
  helpText,
  defaultExpanded,
  className,
}: SmartSectionProps) {
  // Auto-determine if section should be expanded based on importance and usage
  const shouldExpandByDefault =
    defaultExpanded ?? (importance === 'high' || usageFrequency === 'frequent');

  const [showHelpTooltip, setShowHelpTooltip] = React.useState(false);

  return (
    <ProgressiveDisclosure
      defaultOpen={shouldExpandByDefault}
      variant={importance === 'high' ? 'highlighted' : 'subtle'}
      className={className}
      trigger={
        <div className='flex items-center gap-2'>
          <span
            className={cn(
              'font-medium',
              importance === 'high'
                ? 'text-sidebar-primary'
                : 'text-sidebar-foreground'
            )}
          >
            {title}
          </span>
          {description && (
            <span className='text-xs text-sidebar-muted-foreground'>
              {description}
            </span>
          )}
          {showHelp && helpText && (
            <div className='relative'>
              <button
                onMouseEnter={() => setShowHelpTooltip(true)}
                onMouseLeave={() => setShowHelpTooltip(false)}
                className='text-sidebar-muted-foreground hover:text-sidebar-foreground transition-colors'
              >
                <InformationCircleIcon className='h-3 w-3' />
              </button>
              {showHelpTooltip && (
                <div className='absolute left-0 top-6 z-50 w-64 p-2 bg-sidebar-background border border-sidebar-border rounded-md shadow-lg text-xs'>
                  {helpText}
                </div>
              )}
            </div>
          )}
        </div>
      }
    >
      {children}
    </ProgressiveDisclosure>
  );
}

// Collapsible list with smart "show more" behavior
interface CollapsibleListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  initialShowCount?: number;
  showMoreText?: string;
  showLessText?: string;
  className?: string;
}

export function CollapsibleList<T>({
  items,
  renderItem,
  initialShowCount = 3,
  showMoreText = 'Show more',
  showLessText = 'Show less',
  className,
}: CollapsibleListProps<T>) {
  const [showAll, setShowAll] = React.useState(false);

  const displayedItems = showAll ? items : items.slice(0, initialShowCount);
  const hasMore = items.length > initialShowCount;

  if (!hasMore) {
    return <div className={className}>{items.map(renderItem)}</div>;
  }

  return (
    <div className={className}>
      {displayedItems.map(renderItem)}

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className='w-full mt-2 p-2 text-xs text-sidebar-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-all duration-200'
        >
          {showAll
            ? showLessText
            : `${showMoreText} (${items.length - initialShowCount} more)`}
        </button>
      )}
    </div>
  );
}
