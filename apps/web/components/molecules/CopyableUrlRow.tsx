'use client';

import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

interface CopyableUrlRowProps {
  readonly url: string;
  readonly displayValue?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly valueClassName?: string;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: () => void;
  readonly copyButtonTitle?: string;
  readonly openButtonTitle?: string;
  readonly testId?: string;
  readonly surface?: 'boxed' | 'flat';
}

export function CopyableUrlRow({
  url,
  displayValue,
  size = 'md',
  className,
  valueClassName,
  onCopySuccess,
  onCopyError,
  copyButtonTitle = 'Copy link',
  openButtonTitle = 'Open link',
  testId,
  surface = 'boxed',
}: CopyableUrlRowProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
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
    },
    [url, onCopySuccess, onCopyError]
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      globalThis.open(url, '_blank', 'noopener,noreferrer');
    },
    [url]
  );

  const sizeClasses = {
    sm: {
      container: 'h-[20px] gap-[3px] rounded-md px-1',
      icon: 'h-[11px] w-[11px]',
      value: 'text-[10.5px]',
      button: 'h-4 w-4 rounded-full',
      glyph: 'h-[10px] w-[10px]',
    },
    md: {
      container: 'h-7 gap-1.5 rounded-[8px] px-2.5',
      icon: 'h-3 w-3',
      value: 'text-[11px]',
      button: 'h-5 w-5 rounded-full',
      glyph: 'h-3 w-3',
    },
    lg: {
      container: 'h-8 gap-1.5 rounded-[8px] px-2.5',
      icon: 'h-3.5 w-3.5',
      value: 'text-[11.5px]',
      button: 'h-5.5 w-5.5 rounded-full',
      glyph: 'h-3.5 w-3.5',
    },
  } as const;

  const styles = sizeClasses[size];

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex items-center transition-[background-color,border-color] duration-150',
        surface === 'boxed'
          ? 'border border-(--linear-app-frame-seam) bg-surface-0 hover:bg-surface-1'
          : 'border border-transparent bg-transparent hover:bg-surface-1/80',
        styles.container,
        className
      )}
    >
      <Link2
        className={cn(styles.icon, 'shrink-0 text-tertiary-token')}
        aria-hidden='true'
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono tracking-[-0.01em] text-secondary-token',
          styles.value,
          'leading-none',
          valueClassName
        )}
        title={url}
      >
        {displayValue ?? url.replace(/^https?:\/\//, '')}
      </span>
      <DrawerInlineIconButton
        onClick={handleCopy}
        title={isCopied ? 'Copied!' : copyButtonTitle}
        className={cn(
          'shrink-0 text-tertiary-token',
          styles.button,
          isCopied && 'text-success'
        )}
      >
        <Copy className={styles.glyph} />
        <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
      </DrawerInlineIconButton>
      <DrawerInlineIconButton
        onClick={handleOpen}
        title={openButtonTitle}
        className={cn('shrink-0 text-tertiary-token', styles.button)}
      >
        <ExternalLink className={styles.glyph} />
        <span className='sr-only'>Open</span>
      </DrawerInlineIconButton>
    </div>
  );
}
