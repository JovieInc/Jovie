'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ThemeOption {
  value: 'light' | 'dark' | 'system';
  label: string;
  description: string;
  preview: {
    bg: string;
    sidebar: string;
    accent: string;
  };
}

const themeOptions: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright and clean.',
    preview: {
      bg: 'bg-white',
      sidebar: 'bg-gray-50',
      accent: 'bg-gray-100',
    },
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Bold and focused.',
    preview: {
      bg: 'bg-gray-900',
      sidebar: 'bg-gray-800',
      accent: 'bg-gray-700',
    },
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match device settings.',
    preview: {
      bg: 'bg-gradient-to-br from-white to-gray-900',
      sidebar: 'bg-gradient-to-br from-gray-50 to-gray-800',
      accent: 'bg-gradient-to-br from-gray-100 to-gray-700',
    },
  },
];

interface ThemeSelectorProps {
  currentTheme?: string;
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  className?: string;
}

export function ThemeSelector({
  currentTheme,
  onThemeChange,
  className,
}: ThemeSelectorProps) {
  return (
    <div className={className}>
      <div className='grid grid-cols-3 gap-4'>
        {themeOptions.map(option => (
          <button
            key={option.value}
            onClick={() => onThemeChange(option.value)}
            className={cn(
              'group relative flex flex-col p-4 rounded-xl border-2 transition-all duration-300 ease-in-out',
              'hover:translate-y-[-2px] hover:shadow-lg focus-visible:ring-2 ring-accent focus-visible:outline-none card-hover',
              currentTheme === option.value
                ? 'border-accent/70 bg-surface-2'
                : 'border-subtle hover:border-accent/50'
            )}
          >
            {/* Miniature Dashboard Preview */}
            <div className='relative w-full h-20 rounded-lg overflow-hidden mb-3'>
              <div className={`w-full h-full ${option.preview.bg}`}>
                {/* Sidebar */}
                <div
                  className={`absolute left-0 top-0 w-6 h-full ${option.preview.sidebar} rounded-r`}
                />
                {/* Content area with some mock elements */}
                <div className='absolute left-8 top-2 right-2 bottom-2 space-y-1'>
                  <div
                    className={`h-2 ${option.preview.accent} rounded w-1/3`}
                  />
                  <div
                    className={`h-1.5 ${option.preview.accent} rounded w-1/2 opacity-60`}
                  />
                  <div
                    className={`h-1.5 ${option.preview.accent} rounded w-2/3 opacity-40`}
                  />
                </div>
              </div>
            </div>

            {/* Option Info */}
            <div className='text-left'>
              <h4 className='font-medium text-primary text-sm mb-1'>
                {option.label}
              </h4>
              <p className='text-xs text-secondary mt-1'>
                {option.description}
              </p>
            </div>

            {/* Animated Checkmark Overlay */}
            {currentTheme === option.value && (
              <div className='absolute top-2 right-2 w-5 h-5 bg-accent-token rounded-full flex items-center justify-center animate-in zoom-in-95 fade-in duration-200'>
                <svg
                  className='w-3 h-3 text-white'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={3}
                    d='M5 13l4 4L19 7'
                  />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      <p className='text-xs text-secondary mt-4'>
        Choose how the interface appears. System automatically matches your
        device settings.
      </p>
    </div>
  );
}
