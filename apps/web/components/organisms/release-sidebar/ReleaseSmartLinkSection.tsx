'use client';

import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseSmartLinkSectionProps {
  readonly smartLinkPath: string;
}

export function ReleaseSmartLinkSection({
  smartLinkPath,
}: ReleaseSmartLinkSectionProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(smartLinkUrl)
      .then(() => {
        setIsCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(() => {});
  }, [smartLinkUrl]);

  const handleOpen = useCallback(() => {
    globalThis.open(smartLinkUrl, '_blank');
  }, [smartLinkUrl]);

  // Strip protocol for display
  const displayUrl = smartLinkUrl.replace(/^https?:\/\//, '');

  return (
    <div className='flex items-center gap-2 lg:gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 py-2.5 lg:px-2 lg:py-1.5'>
      <Link2
        className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <span
        className='min-w-0 flex-1 truncate font-mono text-[11px] text-secondary-token'
        title={smartLinkUrl}
      >
        {displayUrl}
      </span>
      <button
        type='button'
        onClick={handleCopy}
        title={isCopied ? 'Copied!' : 'Copy link'}
        className={cn(
          'shrink-0 rounded transition-colors',
          'min-h-[44px] min-w-[44px] flex items-center justify-center',
          'lg:min-h-0 lg:min-w-0 lg:p-0.5',
          'text-tertiary-token active:bg-surface-2/50 lg:active:bg-transparent',
          'lg:hover:text-primary-token lg:hover:bg-surface-2',
          isCopied && 'text-success'
        )}
      >
        <Copy className='h-3 w-3' />
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </button>
      <button
        type='button'
        onClick={handleOpen}
        title='Open smart link'
        className={cn(
          'shrink-0 rounded transition-colors',
          'min-h-[44px] min-w-[44px] flex items-center justify-center',
          'lg:min-h-0 lg:min-w-0 lg:p-0.5',
          'text-tertiary-token active:bg-surface-2/50 lg:active:bg-transparent',
          'lg:hover:text-primary-token lg:hover:bg-surface-2'
        )}
      >
        <ExternalLink className='h-3 w-3' />
        <span className='sr-only'>Open</span>
      </button>
    </div>
  );
}
