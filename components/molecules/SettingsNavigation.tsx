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
  // Group settings into logical sections
  const basicItems = items.filter(
    item => !item.isPro && !['billing'].includes(item.id)
  );
  const proItems = items.filter(item => item.isPro);
  const accountItems = items.filter(item => item.id === 'billing');

  const renderNavGroup = (groupItems: SettingsNavItem[], title?: string) => (
    <div>
      {title && (
        <h3 className='px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
          {title}
        </h3>
      )}
      <div className='space-y-1'>
        {groupItems.map(item => {
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
                'w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/30'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                isLocked && 'opacity-60'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                )}
              >
                <Icon className='h-4 w-4' />
              </div>
              <span className='flex-1'>{item.name}</span>
              {isLocked && (
                <div className='flex items-center gap-1'>
                  <span className='text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full dark:bg-orange-900/30 dark:text-orange-300'>
                    Pro
                  </span>
                  <ShieldCheckIcon className='h-4 w-4 text-orange-400' />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn('w-72 flex-shrink-0', className)}>
      <div className='sticky top-6 space-y-6'>
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
            Settings
          </h2>
          <nav className='space-y-6'>
            {renderNavGroup(basicItems, 'General')}
            {proItems.length > 0 &&
              renderNavGroup(proItems, 'Professional Features')}
            {accountItems.length > 0 &&
              renderNavGroup(accountItems, 'Account & Billing')}
          </nav>
        </div>

        {/* Pro status indicator */}
        <div
          className={cn(
            'p-4 rounded-xl border',
            isPro
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
          )}
        >
          <div className='flex items-center gap-3'>
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                isPro ? 'bg-green-500' : 'bg-blue-500'
              )}
            >
              {isPro ? (
                <svg
                  className='w-4 h-4 text-white'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                    clipRule='evenodd'
                  />
                </svg>
              ) : (
                <svg
                  className='w-4 h-4 text-white'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z'
                    clipRule='evenodd'
                  />
                </svg>
              )}
            </div>
            <div className='flex-1'>
              <p
                className={cn(
                  'text-sm font-medium',
                  isPro
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-blue-800 dark:text-blue-200'
                )}
              >
                {isPro ? 'Pro Account' : 'Free Account'}
              </p>
              <p
                className={cn(
                  'text-xs',
                  isPro
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-blue-600 dark:text-blue-400'
                )}
              >
                {isPro ? 'All features unlocked' : 'Upgrade for more features'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
