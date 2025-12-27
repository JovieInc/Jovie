'use client';

import { cn } from '@/lib/utils';

export type ProviderStatus = 'available' | 'manual' | 'missing';

export interface ProviderStatusDotProps {
  status: ProviderStatus;
  accent: string;
}

export function ProviderStatusDot({ status, accent }: ProviderStatusDotProps) {
  if (status === 'missing') {
    return (
      <span className='flex h-2.5 w-2.5 items-center justify-center rounded-full border border-subtle bg-surface-2'>
        <span className='h-1 w-1 rounded-full bg-tertiary-token' />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative flex h-2.5 w-2.5 items-center justify-center rounded-full',
        status === 'manual' && 'ring-2 ring-amber-400/30'
      )}
      style={{ backgroundColor: accent }}
    >
      {status === 'manual' && (
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500' />
      )}
    </span>
  );
}
