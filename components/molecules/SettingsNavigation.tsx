'use client';

import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SettingsNavItem {
  name: string;
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  isPro?: boolean;
}

interface SettingsNavigationProps {
  items: SettingsNavItem[];
  currentSection: string;
  isPro: boolean;
  onNavigate: (sectionId: string) => void;
  className?: string;
}

export function SettingsNavigation({
  items,
  currentSection,
  isPro,
  onNavigate,
  className,
}: SettingsNavigationProps) {
  return (
    <div className={cn('w-64 flex-shrink-0', className)}>
      <div className='sticky top-0'>
        <nav className='space-y-1'>
          {items.map(item => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            const isLocked = item.isPro && !isPro;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isLocked) {
                    onNavigate('billing');
                  } else {
                    onNavigate(item.id);
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-primary hover:bg-surface-2',
                  isLocked && 'opacity-60'
                )}
              >
                <Icon className='h-5 w-5 flex-shrink-0' />
                <span className='flex-1'>{item.name}</span>
                {isLocked && (
                  <ShieldCheckIcon className='h-4 w-4 text-orange-400' />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
