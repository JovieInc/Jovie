'use client';

import { LoadingSkeleton as CanonicalLoadingSkeleton, Skeleton } from '@jovie/ui';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// Generate stable keys for skeleton items to avoid array index key warnings
function generateSkeletonKeys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

export { CanonicalLoadingSkeleton as LoadingSkeleton };

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
      className='block space-y-5'
      aria-label='Loading authentication form'
      aria-busy='true'
    >
      <span
        className='block h-4 w-24 rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-16 w-full max-w-[17rem] rounded-[2rem] skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-4 w-full max-w-[19rem] rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-[3.9rem] w-full rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-[3.9rem] w-full rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <div className='flex items-center gap-4 py-1' aria-hidden='true'>
        <span className='h-px flex-1 bg-white/8' />
        <span className='block h-3 w-6 rounded-full skeleton motion-reduce:animate-none' />
        <span className='h-px flex-1 bg-white/8' />
      </div>
      <span
        className='block h-[3.75rem] w-full rounded-full skeleton motion-reduce:animate-none'
        aria-hidden='true'
      />
      <span
        className='block h-[3.9rem] w-full rounded-full skeleton motion-reduce:animate-none'
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
