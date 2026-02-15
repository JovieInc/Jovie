'use client';

import { Check, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { SwipeToReveal } from '@/components/atoms/SwipeToReveal';
import { cn } from '@/lib/utils';

const ACTION_BUTTON_CLASS = [
  'p-1 rounded hover:bg-sidebar-border',
  'text-sidebar-muted hover:text-sidebar-foreground',
  'transition-colors focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
].join(' ');

const SWIPE_ACTION_BUTTON_CLASS = [
  'flex h-full items-center justify-center px-4',
  'text-white transition-colors active:opacity-80',
].join(' ');

export interface SidebarLinkRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly url: string;
  readonly badge?: string;
  readonly isEditable?: boolean;
  readonly isRemoving?: boolean;
  readonly onRemove?: () => void;
  readonly className?: string;
  readonly testId?: string;
}

export function SidebarLinkRow({
  icon,
  label,
  url,
  badge,
  isEditable = false,
  isRemoving = false,
  onRemove,
  className,
  testId,
}: SidebarLinkRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Silently fail - clipboard may not be available
      });
  }, [url]);

  const handleOpen = useCallback(() => {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const hasRemove = isEditable && onRemove;
  const swipeActionsWidth = hasRemove ? 132 : 88;

  const swipeActions = (
    <>
      <button
        type='button'
        onClick={handleCopy}
        className={cn(SWIPE_ACTION_BUTTON_CLASS, 'bg-blue-500')}
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
        className={cn(SWIPE_ACTION_BUTTON_CLASS, 'bg-gray-500')}
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
            'bg-red-500 disabled:opacity-50'
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
          'px-3 py-1.5 bg-base hover:bg-sidebar-surface-hover',
          'transition-colors',
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
            <span className='text-[10px] text-sidebar-muted shrink-0'>
              {badge}
            </span>
          )}
        </div>

        {/* Right: Actions (visible on hover/focus - desktop only) */}
        <div
          className={[
            'flex items-center gap-0.5 opacity-0',
            'group-hover:opacity-100 group-focus:opacity-100',
            'group-focus-within:opacity-100 transition-opacity shrink-0',
          ].join(' ')}
        >
          <button
            type='button'
            onClick={handleOpen}
            className={ACTION_BUTTON_CLASS}
            aria-label={`Open ${label}`}
          >
            <ExternalLink className='h-4 w-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={handleCopy}
            className={ACTION_BUTTON_CLASS}
            aria-label={copied ? 'Copied!' : `Copy ${label} link`}
          >
            {copied ? (
              <Check className='h-4 w-4 text-success' aria-hidden='true' />
            ) : (
              <Copy className='h-4 w-4' aria-hidden='true' />
            )}
          </button>
          {hasRemove && (
            <button
              type='button'
              onClick={onRemove}
              disabled={isRemoving}
              className={cn(ACTION_BUTTON_CLASS, 'disabled:opacity-50')}
              aria-label={`Remove ${label}`}
            >
              <Trash2 className='h-4 w-4' aria-hidden='true' />
            </button>
          )}
        </div>
      </div>
    </SwipeToReveal>
  );
}
