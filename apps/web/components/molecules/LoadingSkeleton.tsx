'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// Generate stable keys for skeleton items to avoid array index key warnings
function generateSkeletonKeys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

interface LoadingSkeletonProps {
  readonly className?: string;
  readonly lines?: number;
  readonly height?: string;
  readonly width?: string;
  readonly rounded?: 'sm' | 'md' | 'lg' | 'full';
}

// Valid Tailwind height/width classes for validation
const VALID_SIZE_CLASSES = new Set([
  'h-1',
  'h-2',
  'h-3',
  'h-4',
  'h-5',
  'h-6',
  'h-7',
  'h-8',
  'h-9',
  'h-10',
  'h-11',
  'h-12',
  'h-14',
  'h-16',
  'h-20',
  'h-24',
  'h-28',
  'h-32',
  'h-36',
  'h-40',
  'h-44',
  'h-48',
  'h-52',
  'h-56',
  'h-60',
  'h-64',
  'h-72',
  'h-80',
  'h-96',
  'h-auto',
  'h-full',
  'h-screen',
  'w-1',
  'w-2',
  'w-3',
  'w-4',
  'w-5',
  'w-6',
  'w-7',
  'w-8',
  'w-9',
  'w-10',
  'w-11',
  'w-12',
  'w-14',
  'w-16',
  'w-20',
  'w-24',
  'w-28',
  'w-32',
  'w-36',
  'w-40',
  'w-44',
  'w-48',
  'w-52',
  'w-56',
  'w-60',
  'w-64',
  'w-72',
  'w-80',
  'w-96',
  'w-auto',
  'w-full',
  'w-screen',
  'w-1/2',
  'w-1/3',
  'w-2/3',
  'w-1/4',
  'w-2/4',
  'w-3/4',
  'w-1/5',
  'w-2/5',
  'w-3/5',
  'w-4/5',
  'w-1/6',
  'w-2/6',
  'w-3/6',
  'w-4/6',
  'w-5/6',
]);

function validateSizeClass(value: string, propName: string): string {
  if (!VALID_SIZE_CLASSES.has(value)) {
    console.warn(
      `LoadingSkeleton: Invalid ${propName} class "${value}". Using default value instead.`
    );
    return propName === 'height' ? 'h-4' : 'w-full';
  }
  return value;
}

export function LoadingSkeleton({
  className,
  lines = 1,
  height = 'h-4',
  width = 'w-full',
  rounded = 'sm',
}: Readonly<LoadingSkeletonProps>) {
  // Validate height and width classes
  const validatedHeight = validateSizeClass(height, 'height');
  const validatedWidth = validateSizeClass(width, 'width');

  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  // Generate stable keys for multi-line skeletons
  const lineKeys = useMemo(
    () => generateSkeletonKeys('skeleton-line', lines),
    [lines]
  );

  if (lines === 1) {
    return (
      <div
        className={cn(
          'skeleton motion-reduce:animate-none',
          roundedClasses[rounded],
          validatedHeight,
          validatedWidth,
          className
        )}
        aria-hidden='true'
      />
    );
  }

  return (
    <div className='space-y-2' aria-hidden='true'>
      {lineKeys.map((key, index) => (
        <div
          key={key}
          className={cn(
            'skeleton motion-reduce:animate-none',
            roundedClasses[rounded],
            validatedHeight,
            index === lines - 1 ? 'w-3/4' : validatedWidth,
            className
          )}
        />
      ))}
    </div>
  );
}

// Specific skeleton components for common use cases
export function ProfileSkeleton() {
  return (
    <output
      className='flex flex-col items-center space-y-4 text-center'
      aria-busy='true'
      aria-label='Loading artist profile'
    >
      <span
        className='block h-32 w-32 rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <div className='space-y-2'>
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA props needed for loading skeleton accessibility */}
        {/* biome-ignore lint/a11y/useValidAriaRole: role=text is valid for loading state */}
        <div
          className='h-8 w-48 rounded-sm skeleton motion-reduce:animate-none'
          aria-label='Loading artist name'
          role='text'
        />
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA props needed for loading skeleton accessibility */}
        {/* biome-ignore lint/a11y/useValidAriaRole: role=text is valid for loading state */}
        <div
          className='h-6 w-64 rounded-sm skeleton motion-reduce:animate-none'
          aria-label='Loading artist tagline'
          role='text'
        />
      </div>
    </output>
  );
}

export function ButtonSkeleton() {
  return (
    <output aria-label='Loading action button' aria-busy='true'>
      <span
        className='block h-12 w-full max-w-sm rounded-lg skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
    </output>
  );
}

const SOCIAL_BAR_SKELETON_KEYS = generateSkeletonKeys('social-link', 4);

export function SocialBarSkeleton() {
  return (
    <nav
      className='flex flex-wrap justify-center gap-4'
      aria-label='Loading social media links'
      aria-busy='true'
    >
      {SOCIAL_BAR_SKELETON_KEYS.map(key => (
        <span
          key={key}
          className='block h-12 w-12 rounded-full skeleton motion-reduce:animate-none'
          aria-hidden='true'
        />
      ))}
    </nav>
  );
}

export function AuthFormSkeleton() {
  return (
    <output
      className='block space-y-4'
      aria-label='Loading authentication form'
      aria-busy='true'
    >
      <span
        className='block h-10 w-full rounded-md skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-10 w-full rounded-md skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-10 w-full rounded-md skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-12 w-full rounded-md skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
    </output>
  );
}

export function CardSkeleton() {
  return (
    <div className='w-full p-4 border border-subtle rounded-lg'>
      <div className='space-y-3'>
        <div className='flex items-center space-x-3'>
          <div className='h-10 w-10 rounded-full skeleton motion-reduce:animate-none' />
          <div className='space-y-1 flex-1'>
            <div className='h-4 w-1/2 rounded-sm skeleton motion-reduce:animate-none' />
            <div className='h-3 w-1/3 rounded-sm skeleton motion-reduce:animate-none' />
          </div>
        </div>
        <div className='h-24 rounded-md skeleton motion-reduce:animate-none' />
        <div className='flex justify-between'>
          <div className='h-8 w-24 rounded-md skeleton motion-reduce:animate-none' />
          <div className='h-8 w-24 rounded-md skeleton motion-reduce:animate-none' />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 3,
}: Readonly<{
  rows?: number;
  columns?: number;
}>) {
  const headerKeys = useMemo(
    () => generateSkeletonKeys('table-header', columns),
    [columns]
  );
  const rowKeys = useMemo(
    () => generateSkeletonKeys('table-row', rows),
    [rows]
  );
  const cellKeys = useMemo(
    () =>
      rowKeys.flatMap((rowKey, rowIndex) =>
        Array.from(
          { length: columns },
          (_, colIndex) => `${rowKey}-col-${colIndex}`
        )
      ),
    [rowKeys, columns]
  );

  return (
    <div className='w-full overflow-hidden border border-subtle rounded-lg'>
      {/* Header */}
      <div className='flex border-b border-subtle bg-surface-1'>
        {headerKeys.map(key => (
          <div key={key} className='flex-1 p-3'>
            <div className='h-5 rounded-sm skeleton motion-reduce:animate-none' />
          </div>
        ))}
      </div>

      {/* Rows */}
      {rowKeys.map((rowKey, rowIndex) => (
        <div
          key={rowKey}
          className='flex border-b border-subtle last:border-b-0'
        >
          {Array.from({ length: columns }, (_, colIndex) => {
            const cellKey = cellKeys[rowIndex * columns + colIndex];
            return (
              <div key={cellKey} className='flex-1 p-3'>
                <div
                  className={cn(
                    'h-4 rounded-sm skeleton motion-reduce:animate-none',
                    colIndex === 0 ? 'w-3/4' : 'w-full'
                  )}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
