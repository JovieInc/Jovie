'use client';

import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useClipboard } from '@/hooks/useClipboard';

interface ReferralCodeCopyClientProps {
  readonly shareUrl: string;
}

export function ReferralCodeCopyClient({
  shareUrl,
}: ReferralCodeCopyClientProps) {
  const { copy, isSuccess: copied, isError } = useClipboard();
  const [pending, setPending] = useState(false);

  const handleCopy = useCallback(async () => {
    setPending(true);
    try {
      await copy(shareUrl);
    } finally {
      setPending(false);
    }
  }, [copy, shareUrl]);

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <code className='flex-1 truncate rounded bg-surface-2 px-3 py-2 text-sm font-medium text-primary-token'>
          {shareUrl}
        </code>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={pending}
          aria-busy={pending}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className='h-4 w-4 text-success' />
          ) : (
            <Copy className='h-4 w-4' />
          )}
          <span className='ml-1.5'>
            {pending
              ? 'Copying…'
              : copied
                ? 'Copied'
                : isError
                  ? 'Retry copy'
                  : 'Copy'}
          </span>
        </Button>
      </div>
      {isError && (
        <p role='status' className='text-xs text-secondary-token'>
          Couldn&apos;t copy. Select the link to copy it manually, or try again.
        </p>
      )}
    </div>
  );
}
