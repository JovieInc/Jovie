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
        className={cn(SWIPE_ACTION_BUTTON_CLASS, 'bg-surface-3')}
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
          'group flex items-center justify-between lg:rounded-md',
          'px-3 py-1.5 hover:bg-interactive-hover',
          'transition-colors',
          !isVisible && 'opacity-60',
          className
        )}
        data-testid={testId}
      >
        {/* Left: Icon + Label */}
        <div className='flex items-center gap-2.5 min-w-0'>
          <span className='shrink-0 w-5 flex items-center justify-center'>
            {icon}
          </span>
          <span className='text-xs text-secondary-token truncate'>{label}</span>
          {badge && (
            <span className='text-[10px] text-tertiary-token shrink-0'>
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
                  'p-1 rounded text-tertiary-token',
                  'hover:text-primary-token hover:bg-surface-2',
                  'transition-colors focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-interactive'
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
