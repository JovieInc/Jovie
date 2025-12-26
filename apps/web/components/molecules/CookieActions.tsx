'use client';

import { Button } from '@jovie/ui';

export interface CookieActionsProps {
  onAcceptAll: () => void;
  onReject: () => void;
  onCustomize: () => void;
  className?: string;
}

export function CookieActions({
  onAcceptAll,
  onReject,
  onCustomize,
  className = '',
}: CookieActionsProps) {
  return (
    <div
      className={`flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap ${className}`}
    >
      <div className='flex gap-2'>
        <Button
          onClick={onReject}
          variant='outline'
          size='sm'
          className='flex-1 whitespace-nowrap rounded-lg border px-3 py-2.5 text-sm font-medium sm:flex-none'
        >
          Reject
        </Button>
        <Button
          onClick={onCustomize}
          variant='outline'
          size='sm'
          className='flex-1 whitespace-nowrap rounded-lg border px-3 py-2.5 text-sm font-medium sm:flex-none'
        >
          Customize
        </Button>
      </div>
      <Button
        onClick={onAcceptAll}
        variant='primary'
        size='sm'
        className='w-full whitespace-nowrap rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white sm:w-auto dark:bg-white dark:text-black'
      >
        Accept All
      </Button>
    </div>
  );
}
