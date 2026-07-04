'use client';

import { Skeleton, LoadingSkeleton as UILoadingSkeleton } from '@jovie/ui';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';

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

const SIZE_TOKEN_PATTERN = /^\d+(?:\.\d+)?$/;
const FRACTION_TOKEN_PATTERN = /^\d+\/\d+$/;
const ARBITRARY_TOKEN_PATTERN = /^\[[^\]]+\]$/;

const VALID_HEIGHT_KEYWORDS = new Set([
  'auto',
  'full',
  'screen',
  'svh',
  'lvh',
  'dvh',
  'min',
  'max',
  'fit',
  'px',
]);

const VALID_WIDTH_KEYWORDS = new Set([
  'auto',
  'full',
  'screen',
  'svw',
  'lvw',
  'dvw',
  'min',
  'max',
  'fit',
  'px',
]);

function isValidSizeClass(
  value: string,
  propName: 'height' | 'width'
): boolean {
  const prefix = propName === 'height' ? 'h-' : 'w-';

  if (!value.startsWith(prefix)) {
    return false;
  }

  const token = value.slice(prefix.length);
  if (!token) {
    return false;
  }

  if (SIZE_TOKEN_PATTERN.test(token) || ARBITRARY_TOKEN_PATTERN.test(token)) {
    return true;
  }

  if (propName === 'width' && FRACTION_TOKEN_PATTERN.test(token)) {
    return true;
  }

  return propName === 'height'
    ? VALID_HEIGHT_KEYWORDS.has(token)
    : VALID_WIDTH_KEYWORDS.has(token);
}

function validateSizeClass(value: string, propName: string): string {
  const sizePropName = propName === 'height' ? 'height' : 'width';

  if (!isValidSizeClass(value, sizePropName)) {
    logger.warn(
      `Invalid ${propName} class "${value}". Using default value instead.`,
      undefined,
      'LoadingSkeleton'
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

  return (
    <UILoadingSkeleton
      className={className}
      lines={lines}
      height={validatedHeight}
      width={validatedWidth}
      rounded={rounded}
    />
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
      <Skeleton className='h-32 w-32' rounded='full' />
      <div className='space-y-2'>
        <Skeleton className='h-8 w-48' aria-label='Loading artist name' />
        <Skeleton className='h-6 w-64' aria-label='Loading artist tagline' />
      </div>
    </output>
  );
}

export function ButtonSkeleton() {
  return (
    <output aria-label='Loading action button' aria-busy='true'>
      <Skeleton className='block h-12 w-full max-w-sm' rounded='lg' />
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
        <Skeleton key={key} className='h-12 w-12' rounded='full' />
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
      <Skeleton className='block h-4 w-24' rounded='full' />
      <Skeleton
        className='block h-16 w-full max-w-[17rem] rounded-[2rem]'
        rounded='none'
      />
      <Skeleton className='block h-4 w-full max-w-[19rem]' rounded='full' />
      <Skeleton className='block h-[3.9rem] w-full' rounded='full' />
      <Skeleton className='block h-[3.9rem] w-full' rounded='full' />
      <div className='flex items-center gap-4 py-1' aria-hidden='true'>
        <span className='h-px flex-1 bg-white/8' />
        <Skeleton className='block h-3 w-6' rounded='full' />
        <span className='h-px flex-1 bg-white/8' />
      </div>
      <Skeleton className='block h-[3.75rem] w-full' rounded='full' />
      <Skeleton className='block h-[3.9rem] w-full' rounded='full' />
    </output>
  );
}

export function CardSkeleton() {
  return (
    <div className='w-full p-4 border border-subtle rounded-lg'>
      <div className='space-y-3'>
        <div className='flex items-center space-x-3'>
          <Skeleton className='h-10 w-10' rounded='full' />
          <div className='space-y-1 flex-1'>
            <Skeleton className='h-4 w-1/2' />
            <Skeleton className='h-3 w-1/3' />
          </div>
        </div>
        <Skeleton className='h-24' rounded='md' />
        <div className='flex justify-between'>
          <Skeleton className='h-8 w-24' rounded='md' />
          <Skeleton className='h-8 w-24' rounded='md' />
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
            <Skeleton className='h-5' />
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
                <Skeleton
                  className={cn('h-4', colIndex === 0 ? 'w-3/4' : 'w-full')}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
