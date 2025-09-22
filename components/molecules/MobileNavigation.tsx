'use client';

import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { useMobile } from '@/hooks/useGestures';
import { cn } from '@/lib/utils';

interface MobileNavigationProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function MobileNavigation({
  isOpen,
  onOpenChange,
  children,
  className,
}: MobileNavigationProps) {
  const { isMobile } = useMobile();
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);

  // Handle drag to close
  const handleDragStart = React.useCallback(() => {
    if (!isMobile || !isOpen) return;
    setIsDragging(true);
    setDragOffset(0);
  }, [isMobile, isOpen]);

  const handleDragMove = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const startX = 0; // Assuming sidebar starts at 0
      const deltaX = touch.clientX - startX;

      // Only allow dragging to the left (closing)
      if (deltaX < 0) {
        setDragOffset(deltaX);
      }
    },
    [isDragging]
  );

  const handleDragEnd = React.useCallback(() => {
    if (!isDragging) return;

    const threshold = -100; // 100px drag to close
    if (dragOffset < threshold) {
      onOpenChange(false);
    }

    setIsDragging(false);
    setDragOffset(0);
  }, [isDragging, dragOffset, onOpenChange]);

  // Prevent body scroll when mobile nav is open
  React.useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, isOpen]);

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className='fixed inset-0 bg-black/50 z-40 transition-opacity duration-300'
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Mobile Navigation Panel */}
      <div
        className={cn(
          'fixed left-0 top-0 h-full w-80 max-w-[85vw] bg-sidebar-background border-r border-sidebar-border z-50',
          'transform transition-transform duration-300 ease-out',
          'overflow-y-auto overscroll-contain',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          isDragging && 'transition-none',
          className
        )}
        style={{
          transform: isDragging
            ? `translateX(${Math.min(0, dragOffset)}px)`
            : isOpen
              ? 'translateX(0)'
              : 'translateX(-100%)',
        }}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
      >
        {/* Mobile Header */}
        <div className='flex items-center justify-between p-4 border-b border-sidebar-border'>
          <h2 className='text-lg font-semibold text-sidebar-foreground'>
            Menu
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className='p-2 rounded-md hover:bg-sidebar-accent transition-colors'
          >
            <XMarkIcon className='h-5 w-5 text-sidebar-muted-foreground' />
          </button>
        </div>

        {/* Navigation Content */}
        <div className='p-4'>{children}</div>

        {/* Gesture Indicator */}
        {isDragging && (
          <div className='absolute right-4 top-1/2 transform -translate-y-1/2 text-sidebar-muted-foreground'>
            <div className='flex items-center gap-1 text-xs'>
              <span>Swipe to close</span>
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 19l-7-7 7-7'
                />
              </svg>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Mobile navigation trigger button
interface MobileNavTriggerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function MobileNavTrigger({
  isOpen,
  onOpenChange,
  className,
}: MobileNavTriggerProps) {
  const { isMobile } = useMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <button
      onClick={() => onOpenChange(!isOpen)}
      className={cn(
        'p-2 rounded-md hover:bg-sidebar-accent transition-all duration-200',
        'active:scale-95 touch-manipulation',
        className
      )}
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
    >
      <div className='relative w-5 h-5'>
        <Bars3Icon
          className={cn(
            'absolute inset-0 h-5 w-5 transition-all duration-200',
            isOpen ? 'opacity-0 rotate-90' : 'opacity-100 rotate-0'
          )}
        />
        <XMarkIcon
          className={cn(
            'absolute inset-0 h-5 w-5 transition-all duration-200',
            isOpen ? 'opacity-100 rotate-0' : 'opacity-0 rotate-90'
          )}
        />
      </div>
    </button>
  );
}

// Bottom tab navigation for mobile
interface MobileTabNavigationProps {
  items: Array<{
    title: string;
    url: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive?: boolean;
    badge?: React.ReactNode;
  }>;
  className?: string;
}

export function MobileTabNavigation({
  items,
  className,
}: MobileTabNavigationProps) {
  const { isMobile } = useMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-30',
        'bg-sidebar-background/95 backdrop-blur-sm border-t border-sidebar-border',
        'safe-area-inset-bottom',
        className
      )}
    >
      <div className='flex items-center justify-around px-2 py-2'>
        {items.slice(0, 5).map(item => {
          const Icon = item.icon;
          return (
            <a
              key={item.title}
              href={item.url}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200',
                'active:scale-95 touch-manipulation min-w-0 flex-1',
                item.isActive
                  ? 'text-sidebar-primary bg-sidebar-accent'
                  : 'text-sidebar-muted-foreground hover:text-sidebar-foreground'
              )}
            >
              <div className='relative'>
                <Icon className='h-5 w-5' />
                {item.badge && (
                  <div className='absolute -top-1 -right-1'>{item.badge}</div>
                )}
              </div>
              <span className='text-[10px] font-medium truncate max-w-[60px]'>
                {item.title}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
