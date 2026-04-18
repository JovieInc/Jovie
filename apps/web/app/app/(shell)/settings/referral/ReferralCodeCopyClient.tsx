'use client';

import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';

interface ReferralCodeCopyClientProps {
  readonly shareUrl: string;
  readonly code: string;
}

export function ReferralCodeCopyClient({
  shareUrl,
  code,
}: ReferralCodeCopyClientProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  return (
    <div className='flex items-center gap-2'>
      <code className='flex-1 truncate rounded bg-surface-2 px-3 py-2 text-sm font-medium text-primary-token'>
        {shareUrl}
      </code>
      <Button variant='ghost' size='sm' onClick={handleCopy}>
        {copied ? (
          <Check className='h-4 w-4 text-[var(--color-success)]' />
        ) : (
          <Copy className='h-4 w-4' />
        )}
        <span className='ml-1.5'>{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  );
}
