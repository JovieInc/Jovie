'use client';

import { IconButton, type IconButtonSize } from '@jovie/ui';
import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ShareableLinkRowProps {
  readonly url: string;
  readonly displayValue?: string;
  readonly density?: 'compact' | 'rail' | 'table';
  readonly surface?: 'boxed' | 'flat';
  readonly actionsVisibility?: 'always' | 'hover';
  readonly showOpen?: boolean;
  readonly onCopy?: () => void | Promise<void>;
  readonly onOpen?: () => void;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: () => void;
  /** Preserve immediate acknowledgement for legacy controls with synchronous copy hooks. */
  readonly optimisticCopy?: boolean;
  readonly copyButtonTitle?: string;
  readonly openButtonTitle?: string;
  readonly copiedDuration?: number;
  readonly className?: string;
  readonly valueClassName?: string;
  readonly testId?: string;
}

/**
 * Density → IconButton size (visible container + [&_svg] glyph). Hit target
 * stays 44px via Button's pseudo-element. Compact/rail/table rows are
 * 24–32px tall; `lg` (40px) overflows those rows. Glyph size classes on
 * children are redundant — `[&_svg]` on xs/sm/md wins on specificity.
 */
const DENSITY_CLASSES = {
  compact: {
    container: 'h-6 gap-1 rounded-full px-2',
    icon: 'h-3 w-3',
    value: 'text-3xs',
    // Was h-6 chrome + h-3 glyph; xs is 24/12.
    iconButtonSize: 'xs' as const satisfies IconButtonSize,
  },
  rail: {
    container: 'h-8 gap-1.5 rounded-full px-2.5',
    icon: 'h-3 w-3',
    value: 'text-2xs',
    // Prior 20px (`h-5`) chrome → closest xs (24); glyph was already h-3.
    iconButtonSize: 'xs' as const satisfies IconButtonSize,
  },
  table: {
    container: 'h-8 gap-1.5 rounded-full px-3',
    icon: 'h-3.5 w-3.5',
    value: 'text-2xs',
    // Prior 24px chrome + 14px glyph (lg had no [&_svg]). sm keeps 14px glyph.
    iconButtonSize: 'sm' as const satisfies IconButtonSize,
  },
} as const;

/** One accessible copy/open row for compact, rail, and table share destinations. */
export function ShareableLinkRow({
  url,
  displayValue,
  density = 'rail',
  surface = 'boxed',
  actionsVisibility = 'always',
  showOpen = true,
  onCopy,
  onOpen,
  onCopySuccess,
  onCopyError,
  optimisticCopy = false,
  copyButtonTitle = 'Copy link',
  openButtonTitle = 'Open link',
  copiedDuration = 2000,
  className,
  valueClassName,
  testId,
}: Readonly<ShareableLinkRowProps>) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = DENSITY_CLASSES[density];

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const copy = onCopy ?? (() => navigator.clipboard.writeText(url));
      const markCopied = () => {
        setIsCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => setIsCopied(false),
          copiedDuration
        );
      };
      if (optimisticCopy) markCopied();
      let copyResult: void | Promise<void>;
      try {
        copyResult = copy();
      } catch {
        onCopyError?.();
        return;
      }
      void Promise.resolve(copyResult).then(
        () => {
          if (!optimisticCopy) markCopied();
          onCopySuccess?.();
        },
        () => onCopyError?.()
      );
    },
    [copiedDuration, onCopy, onCopyError, onCopySuccess, optimisticCopy, url]
  );

  const handleOpen = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (onOpen) {
        onOpen();
        return;
      }
      globalThis.open(url, '_blank', 'noopener,noreferrer');
    },
    [onOpen, url]
  );

  return (
    <div
      data-testid={testId}
      className={cn(
        'group flex items-center transition-[background-color,border-color] duration-subtle',
        surface === 'boxed'
          ? 'border border-(--app-shell-frame-seam) bg-surface-0 hover:bg-surface-1'
          : 'border border-transparent bg-transparent hover:bg-surface-1/80',
        styles.container,
        surface === 'flat' && 'px-0',
        className
      )}
    >
      {surface !== 'flat' ? (
        <Link2
          className={cn(styles.icon, 'shrink-0 text-tertiary-token')}
          aria-hidden='true'
        />
      ) : null}
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono leading-none tracking-tight text-secondary-token',
          surface === 'flat' ? 'text-xs' : styles.value,
          valueClassName
        )}
        title={url}
        suppressHydrationWarning
      >
        {displayValue ?? url.replace(/^https?:\/\//, '')}
      </span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 transition-opacity duration-subtle',
          actionsVisibility === 'hover' &&
            'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        )}
      >
        <IconButton
          size={styles.iconButtonSize}
          variant='inline'
          onClick={handleCopy}
          title={isCopied ? 'Copied!' : copyButtonTitle}
          aria-label={isCopied ? 'Copied' : copyButtonTitle}
          className='shrink-0'
        >
          <Copy className={cn(isCopied && 'text-success')} />
          <span className='sr-only'>{isCopied ? 'Copied' : 'Copy'}</span>
        </IconButton>
        {showOpen ? (
          <IconButton
            size={styles.iconButtonSize}
            variant='inline'
            onClick={handleOpen}
            title={openButtonTitle}
            aria-label={openButtonTitle}
            className='shrink-0'
          >
            <ExternalLink />
            <span className='sr-only'>Open</span>
          </IconButton>
        ) : null}
      </span>
    </div>
  );
}
