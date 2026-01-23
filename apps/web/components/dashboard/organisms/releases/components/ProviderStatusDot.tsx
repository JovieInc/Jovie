import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ProviderStatusDotProps {
  status: 'available' | 'manual' | 'missing';
  accent: string;
}

export const ProviderStatusDot = memo(function ProviderStatusDot({
  status,
  accent,
}: Readonly<ProviderStatusDotProps>) {
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
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-warning)' />
      )}
    </span>
  );
});
