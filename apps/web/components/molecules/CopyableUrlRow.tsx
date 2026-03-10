'use client';

import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CopyableUrlRowProps {
  readonly url: string;
  readonly displayValue?: string;
  readonly className?: string;
  readonly valueClassName?: string;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: () => void;
  readonly copyButtonTitle?: string;
  readonly openButtonTitle?: string;
  readonly testId?: string;
}

export function CopyableUrlRow({
  url,
  displayValue,
  className,
  valueClassName,
  onCopySuccess,
  onCopyError,
  copyButtonTitle = 'Copy link',
  openButtonTitle = 'Open link',
  testId,
}: CopyableUrlRowProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setIsCopied(true);
        onCopySuccess?.();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(() => {
        onCopyError?.();
      });
  }, [url, onCopySuccess, onCopyError]);

  const handleOpen = useCallback(() => {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex items-center gap-2 rounded-sm border border-subtle bg-surface-1 px-2.5 py-1.5',
        className
      )}
    >
      <Link2
        className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11px] text-secondary-token',
          valueClassName
        )}
        title={url}
      >
        {displayValue ?? url.replace(/^https?:\/\//, '')}
      </span>
      <button
        type='button'
        onClick={handleCopy}
        title={isCopied ? 'Copied!' : copyButtonTitle}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token',
          isCopied && 'text-success'
        )}
      >
        <Copy className='h-3 w-3' />
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </button>
      <button
        type='button'
        onClick={handleOpen}
        title={openButtonTitle}
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
      >
        <ExternalLink className='h-3 w-3' />
        <span className='sr-only'>Open</span>
      </button>
    </div>
  );
}
