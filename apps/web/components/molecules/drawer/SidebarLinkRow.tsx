'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { SwipeToReveal } from '@/components/atoms/SwipeToReveal';
import { CopyToggleIcon } from '@/components/shell/CopyToggleIcon';
import {
  getDSPDeepLinkConfig,
  getSocialDeepLinkConfig,
  openDeepLink,
} from '@/lib/deep-links';
import { cn } from '@/lib/utils';

const SWIPE_ACTION_BUTTON_CLASS =
  'flex h-full items-center justify-center px-4 text-white transition-colors active:opacity-80';

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
  readonly surfaceVariant?: 'default' | 'track';
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
  surfaceVariant = 'default',
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
  const isTrackVariant = surfaceVariant === 'track';

  const swipeActions = (
    <>
      <button
        type='button'
        onClick={handleCopy}
        disabled={!hasUrl}
        className={cn(
          SWIPE_ACTION_BUTTON_CLASS,
          'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,#3182ce)]'
        )}
        aria-label={copied ? 'Copied!' : `Copy ${label} link`}
      >
        <span aria-hidden='true' className='inline-flex'>
          <CopyToggleIcon copied={copied} size='h-4 w-4' />
        </span>
      </button>
      <button
        type='button'
        onClick={handleOpen}
        disabled={!hasUrl}
        className={cn(
          SWIPE_ACTION_BUTTON_CLASS,
          'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))] text-primary-token'
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
            'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,#c43d4b)] disabled:opacity-50'
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
          'group flex min-h-[32px] items-center justify-between bg-transparent',
          isTrackVariant
            ? 'rounded-[10px] border border-transparent px-2 py-1.5 shadow-none active:bg-surface-0 lg:hover:bg-surface-0 focus-within:bg-surface-0'
            : 'rounded-[6px] px-2 py-1 lg:px-2 lg:py-1 active:bg-surface-1 lg:hover:bg-surface-1 focus-within:border-(--linear-border-focus) focus-within:bg-surface-1 focus-within:shadow-inset-ring-focus',
          'transition-[background-color,box-shadow,border-color] duration-150',
          !isVisible && 'opacity-60',
          className
        )}
        data-testid={testId}
        data-surface-variant={surfaceVariant}
        data-surface-style={isTrackVariant ? 'outlined' : 'plain'}
      >
        {/* Left: Icon + Label */}
        <div className='flex min-w-0 flex-1 items-center gap-2.25'>
          <span className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
            {icon}
          </span>
          <span className='text-app font-[460] text-primary-token'>
            {label}
          </span>
          {badge && (
            <span className='shrink-0 text-[10px] text-tertiary-token'>
              {badge}
            </span>
          )}
          {trailingContent}
        </div>

        {/* Right: Kebab dropdown (desktop only — mobile uses swipe-to-reveal) */}
        <div className='max-lg:hidden shrink-0 items-center opacity-0 transition-opacity group-focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 lg:flex'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className={cn(
                  'rounded-[6px] border border-transparent p-1 text-tertiary-token',
                  'hover:border-subtle hover:bg-surface-0 hover:text-primary-token',
                  'transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none',
                  'focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
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
                <CopyToggleIcon copied={copied} size='h-3.5 w-3.5' />
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
