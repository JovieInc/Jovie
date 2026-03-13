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
        'flex h-7 items-center gap-1.5 rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-2 transition-colors hover:bg-(--linear-bg-surface-0)',
        className
      )}
    >
      <Link2
        className='h-3.5 w-3.5 shrink-0 text-(--linear-text-tertiary)'
        aria-hidden='true'
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11px] tracking-[-0.01em] text-(--linear-text-secondary)',
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
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-(--linear-text-tertiary) transition-colors hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
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
        className='flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-(--linear-text-tertiary) transition-colors hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
      >
        <ExternalLink className='h-3 w-3' />
        <span className='sr-only'>Open</span>
      </button>
    </div>
  );
}
