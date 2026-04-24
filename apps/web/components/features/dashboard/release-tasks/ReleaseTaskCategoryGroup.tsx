'use client';

import { Check } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface ReleaseTaskCategoryGroupProps {
  readonly category: string;
  readonly done: number;
  readonly total: number;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly allDone?: boolean;
}

export function ReleaseTaskCategoryGroup({
  category,
  done,
  total,
  children,
  defaultOpen,
  allDone,
}: ReleaseTaskCategoryGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? !allDone);

  return (
    <section aria-label={`${category} — ${done} of ${total} complete`}>
      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        className='flex w-full items-center justify-between px-4 py-1 text-xs font-caption text-secondary-token hover:bg-surface-1 rounded transition-colors'
        aria-expanded={isOpen}
      >
        <span className='flex items-center gap-1.5'>
          {category}{' '}
          <span className='text-3xs text-tertiary-token font-normal'>
            ({done}/{total})
          </span>
          {allDone && (
            <Check className='h-3 w-3 text-emerald-500' aria-hidden='true' />
          )}
        </span>
        <svg
          className={`h-3 w-3 text-tertiary-token transition-transform ${
            isOpen ? '' : '-rotate-90'
          }`}
          viewBox='0 0 12 12'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          aria-hidden='true'
        >
          <title>Toggle section</title>
          <path d='M3 5L6 8L9 5' />
        </svg>
      </button>
      {isOpen && <div className='space-y-0'>{children}</div>}
    </section>
  );
}
