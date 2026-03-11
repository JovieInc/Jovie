'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { SwipeToReveal } from '@/components/atoms/SwipeToReveal';
import {
  getDSPDeepLinkConfig,
  getSocialDeepLinkConfig,
  openDeepLink,
} from '@/lib/deep-links';
import { cn } from '@/lib/utils';

const SWIPE_ACTION_BUTTON_CLASS = [
  'flex h-full items-center justify-center px-4',
  'text-accent-foreground transition-colors active:opacity-80',
].join(' ');

export interface SidebarLinkRowProps {
  readonly deepLinkPlatform?: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly url: string;
  readonly badge?: string;
  readonly isEditable?: boolean;
  readonly isRemoving?: boolean;
  readonly onRemove?: () => void;
  readonly className?: string;
  readonly testId?: string;
  readonly trailingContent?: ReactNode;
  readonly isVisible?: boolean;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: () => void;
}

export function SidebarLinkRow({
  icon,
  label,
  url,
  badge,
  deepLinkPlatform,
  isEditable = false,
  isRemoving = false,
  onRemove,
  className,
  testId,
  trailingContent,
  isVisible = true,
  onCopySuccess,
  onCopyError,
}: SidebarLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const hasUrl = url.trim().length > 0;

  const handleCopy = useCallback(() => {
    if (!hasUrl) return;
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        onCopySuccess?.();
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        onCopyError?.();
        // Silently fail - clipboard may not be available
      });
  }, [hasUrl, onCopyError, onCopySuccess, url]);

  const handleOpen = useCallback(async () => {
    if (!hasUrl) return;

    const deepLinkConfig =
      (deepLinkPlatform ? getDSPDeepLinkConfig(deepLinkPlatform) : null) ??
      (deepLinkPlatform ? getSocialDeepLinkConfig(deepLinkPlatform) : null);

    if (deepLinkConfig) {
      try {
        await openDeepLink(url, deepLinkConfig);
        return;
      } catch {
        // Fall through to standard web open
      }
    }

    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, [deepLinkPlatform, hasUrl, url]);

  const hasRemove = isEditable && onRemove;
  const swipeActionsWidth = hasRemove ? 132 : 88;

  const swipeActions = (
    <>
      <button
        type='button'
        onClick={handleCopy}
        disabled={!hasUrl}
        className={cn(SWIPE_ACTION_BUTTON_CLASS, 'bg-accent')}
        aria-label={copied ? 'Copied!' : `Copy ${label} link`}
      >
        {copied ? (
          <Check className='h-4 w-4' aria-hidden='true' />
        ) : (
          <Copy className='h-4 w-4' aria-hidden='true' />
        )}
      </button>
      <button
        type='button'
        onClick={handleOpen}
        disabled={!hasUrl}
        className={cn(
          SWIPE_ACTION_BUTTON_CLASS,
          'bg-(--linear-bg-surface-2) text-(--linear-text-primary)'
        )}
        aria-label={`Open ${label}`}
      >
        <ExternalLink className='h-4 w-4' aria-hidden='true' />
      </button>
      {hasRemove && (
        <button
          type='button'
          onClick={onRemove}
          disabled={isRemoving}
          className={cn(
            SWIPE_ACTION_BUTTON_CLASS,
            'bg-destructive disabled:opacity-50'
          )}
          aria-label={`Remove ${label}`}
        >
          <Trash2 className='h-4 w-4' aria-hidden='true' />
        </button>
      )}
    </>
  );

  return (
    <SwipeToReveal
      itemId={`sidebar-${label}`}
      actions={swipeActions}
      actionsWidth={swipeActionsWidth}
      className='lg:rounded-md'
    >
      <div
        className={cn(
          'group flex items-center justify-between rounded-[8px]',
          'px-4 py-3 lg:px-3 lg:py-2',
          'active:bg-(--linear-bg-surface-1) lg:active:bg-(--linear-bg-surface-1) lg:hover:bg-(--linear-bg-surface-1)',
          'transition-[background-color,box-shadow,border-color] duration-150 focus-within:bg-(--linear-bg-surface-1) focus-within:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]',
          !isVisible && 'opacity-60',
          className
        )}
        data-testid={testId}
      >
        {/* Left: Icon + Label */}
        <div className='flex min-w-0 flex-1 items-center gap-3 lg:gap-2.5'>
          <span className='shrink-0 w-5 flex items-center justify-center'>
            {icon}
          </span>
          <span className='text-[13px] text-(--linear-text-secondary)'>
            {label}
          </span>
          {badge && (
            <span className='shrink-0 text-[10px] text-(--linear-text-tertiary)'>
              {badge}
            </span>
          )}
          {trailingContent}
        </div>

        {/* Right: Kebab dropdown (desktop only — mobile uses swipe-to-reveal) */}
        <div
          className={[
            'hidden lg:flex items-center shrink-0 opacity-0',
            'group-hover:opacity-100 group-focus:opacity-100',
            'group-focus-within:opacity-100 transition-opacity',
          ].join(' ')}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className={cn(
                  'rounded-[7px] border border-transparent p-1 text-(--linear-text-tertiary)',
                  'hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary)',
                  'transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none',
                  'focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-0) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                )}
                aria-label={`Actions for ${label}`}
              >
                <MoreHorizontal className='h-4 w-4' aria-hidden='true' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' sideOffset={4}>
              <DropdownMenuItem onClick={handleOpen} disabled={!hasUrl}>
                <ExternalLink className='h-3.5 w-3.5' />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy} disabled={!hasUrl}>
                {copied ? (
                  <Check className='h-3.5 w-3.5 text-success' />
                ) : (
                  <Copy className='h-3.5 w-3.5' />
                )}
                {copied ? 'Copied!' : 'Copy URL'}
              </DropdownMenuItem>
              {hasRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={onRemove}
                    disabled={isRemoving}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </SwipeToReveal>
  );
}
