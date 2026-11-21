import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StatusShell({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly tone?: 'neutral' | 'success' | 'error';
}) {
  return (
    <div
      className={cn(
        'w-full max-w-md px-1 py-2 text-primary-token',
        tone === 'error' && 'text-error'
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-secondary-token',
            tone === 'error' && 'text-error',
            tone === 'success' && 'text-success'
          )}
        >
          {icon}
        </span>
        <div className='min-w-0'>
          <p className='text-sm font-semibold leading-5 tracking-tight'>
            {title}
          </p>
          {body ? (
            <p className='mt-1 text-xs leading-5 text-secondary-token'>
              {body}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
