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
    <div className={`flex shrink-0 gap-2 ${className}`}>
      <Button
        onClick={onReject}
        variant='outline'
        size='sm'
        className='rounded border px-3 py-2 text-sm'
      >
        Reject Non-Essential
      </Button>
      <Button
        onClick={onCustomize}
        variant='outline'
        size='sm'
        className='rounded border px-3 py-2 text-sm'
      >
        Customize
      </Button>
      <Button
        onClick={onAcceptAll}
        variant='primary'
        size='sm'
        className='rounded bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black'
      >
        Accept All
      </Button>
    </div>
  );
}
