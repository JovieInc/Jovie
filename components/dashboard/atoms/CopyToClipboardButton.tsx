'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getBaseUrl } from '@/lib/utils/platform-detection';

type CopyStatus = 'idle' | 'success' | 'error';

export interface CopyToClipboardButtonProps {
  relativePath: string; // e.g. '/artist-handle'
  idleLabel?: string;
  successLabel?: string;
  errorLabel?: string;
}

export function CopyToClipboardButton({
  relativePath,
  idleLabel = 'Copy URL',
  successLabel = '✓ Copied!',
  errorLabel = 'Failed to copy',
}: CopyToClipboardButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  const onCopy = async () => {
    try {
      const url = `${getBaseUrl()}${relativePath}`;
      await navigator.clipboard.writeText(url);
      setStatus('success');
    } catch (e) {
      console.error('Failed to copy URL:', e);
      setStatus('error');
    } finally {
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className='relative'>
      <Button variant='secondary' size='sm' onClick={onCopy}>
        {status === 'success'
          ? successLabel
          : status === 'error'
            ? errorLabel
            : idleLabel}
      </Button>
      <span className='sr-only' aria-live='polite' role='status'>
        {status === 'success'
          ? 'Profile URL copied to clipboard'
          : status === 'error'
            ? 'Failed to copy profile URL'
            : ''}
      </span>
    </div>
  );
}
