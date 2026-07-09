'use client';

import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TokenCopyButtonProps {
  readonly token: string;
}

export function TokenCopyButton({ token }: Readonly<TokenCopyButtonProps>) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const visibleToken = isRevealed ? token : `${token.slice(0, 8)}...`;

  function copyToken() {
    navigator.clipboard
      .writeText(token)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Ignore clipboard failures in insecure/local contexts.
      });
  }

  return (
    <span className='inline-flex max-w-full items-center gap-1.5'>
      <code
        className={cn(
          'min-w-0 max-w-40 font-mono text-2xs text-tertiary-token',
          isRevealed
            ? 'break-all whitespace-normal'
            : 'truncate overflow-hidden'
        )}
      >
        {visibleToken}
      </code>
      <button
        type='button'
        onClick={() => setIsRevealed(value => !value)}
        className='inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-[color,opacity] hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        aria-label={
          isRevealed ? 'Hide investor token' : 'Reveal investor token'
        }
        aria-pressed={isRevealed}
      >
        {isRevealed ? (
          <EyeOff className='h-3 w-3' aria-hidden='true' />
        ) : (
          <Eye className='h-3 w-3' aria-hidden='true' />
        )}
      </button>
      <button
        type='button'
        onClick={copyToken}
        className='inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-[color,opacity] hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        aria-label='Copy Full Investor Token'
      >
        {copied ? (
          <Check
            className='h-3 w-3 text-success'
            aria-hidden='true'
            data-testid='token-copy-success'
          />
        ) : (
          <Copy className='h-3 w-3' aria-hidden='true' />
        )}
      </button>
    </span>
  );
}
