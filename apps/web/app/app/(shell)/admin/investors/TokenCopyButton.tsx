'use client';

import { Copy } from 'lucide-react';

interface TokenCopyButtonProps {
  readonly token: string;
}

export function TokenCopyButton({ token }: Readonly<TokenCopyButtonProps>) {
  return (
    <button
      type='button'
      onClick={() => {
        navigator.clipboard.writeText(token).catch(() => {
          // Ignore clipboard failures in insecure/local contexts.
        });
      }}
      className='inline-flex items-center gap-1 text-2xs text-tertiary-token transition-colors hover:text-secondary-token'
      title='Click to copy full token'
    >
      {token.slice(0, 8)}&hellip;
      <Copy className='h-3 w-3' aria-hidden='true' />
    </button>
  );
}
