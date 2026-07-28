'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A quiet, cardless full-plane absence state for primary profile destinations.
 * The owning drawer or tab provides the title and shell chrome.
 */
export function ProfileEmptyState({
  title,
  description,
  action,
  className,
  dataTestId,
}: Readonly<{
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode;
  readonly className?: string;
  readonly dataTestId?: string;
}>) {
  return (
    <section
      className={cn(
        'flex min-h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center',
        className
      )}
      data-testid={dataTestId}
    >
      <div className='w-full max-w-xs space-y-2.5'>
        <h2 className='text-mid font-semibold tracking-[-0.018em] text-primary-token'>
          {title}
        </h2>
        <p className='text-app leading-5 text-tertiary-token'>{description}</p>
        <div className='pt-3'>{action}</div>
      </div>
    </section>
  );
}
