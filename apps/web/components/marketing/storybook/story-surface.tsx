/**
 * Shared Storybook surface chrome for marketing compositions.
 * Uses System B surfaces (bg-base) — never pure black void.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MarketingStorySurfaceProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
}

export function MarketingStorySurface({
  children,
  className,
  label,
}: Readonly<MarketingStorySurfaceProps>) {
  return (
    <div
      className={cn(
        'min-h-screen bg-base text-primary-token antialiased',
        className
      )}
      data-marketing-story-surface=''
      data-testid={
        label ? `marketing-story-${label}` : 'marketing-story-surface'
      }
    >
      {children}
    </div>
  );
}

/**
 * Documented zero-proof / WIP gap panel. Renders real shell surface chrome
 * without fabricating proof data.
 */
export function MarketingSectionGapPanel({
  sectionId,
  reason,
  componentPath,
}: Readonly<{
  readonly sectionId: string;
  readonly reason: string;
  readonly componentPath: string;
}>) {
  return (
    <MarketingStorySurface label={`section-gap-${sectionId}`}>
      <section
        className='mx-auto max-w-public-content px-6 py-16 sm:px-8'
        data-testid={`marketing-section-${sectionId}`}
        data-section-status='wip'
      >
        <p className='text-sm font-medium text-tertiary-token'>
          Marketing / Sections / {sectionId}
        </p>
        <h1 className='mt-3 text-2xl font-semibold tracking-tight text-primary-token'>
          Section Story (Gap)
        </h1>
        <p className='mt-4 max-w-2xl text-sm leading-relaxed text-secondary-token'>
          {reason}
        </p>
        <dl className='mt-8 grid gap-3 text-sm text-secondary-token sm:grid-cols-2'>
          <div className='rounded-xl border border-subtle bg-surface-1 p-4'>
            <dt className='text-tertiary-token'>Registry component</dt>
            <dd className='mt-1 font-mono text-xs text-primary-token break-all'>
              {componentPath}
            </dd>
          </div>
          <div className='rounded-xl border border-subtle bg-surface-1 p-4'>
            <dt className='text-tertiary-token'>Status</dt>
            <dd className='mt-1 text-primary-token'>wip · zero-proof safe</dd>
          </div>
        </dl>
      </section>
    </MarketingStorySurface>
  );
}
