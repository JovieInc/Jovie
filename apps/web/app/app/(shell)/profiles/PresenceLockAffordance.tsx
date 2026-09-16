'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

interface PresenceLockAffordanceProps {
  readonly explanation?: string;
  readonly className?: string;
}

export function PresenceLockAffordance({
  explanation = 'Upgrade required to monitor this page.',
  className,
}: PresenceLockAffordanceProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Monitoring Restricted'
          aria-expanded={open}
          aria-haspopup='dialog'
          data-testid='presence-lock'
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full text-tertiary-token transition-colors duration-fast hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50',
            className
          )}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          onFocus={() => setOpen(true)}
        >
          <LockKeyhole className='h-3.5 w-3.5' aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-56'
        data-testid='presence-lock-explanation'
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <p className='text-xs font-medium text-primary-token'>
          Monitoring Restricted
        </p>
        <p className='mt-1 text-xs text-secondary-token'>{explanation}</p>
        <Link
          href={APP_ROUTES.SETTINGS_BILLING}
          className='mt-2 inline-flex text-xs font-medium text-primary-token underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
          onClick={event => event.stopPropagation()}
        >
          Upgrade
        </Link>
      </PopoverContent>
    </Popover>
  );
}
