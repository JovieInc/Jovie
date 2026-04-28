'use client';

import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { CopyToggleIcon } from '@/components/atoms/CopyToggleIcon';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

export interface SmartLinkRowProps {
  /** Pre-formatted URL — the component does not transform or validate. */
  readonly url: string;
  /**
   * Optional handler for the trailing "open" button. When omitted the
   * button is hidden so the row never advertises an open action that
   * does nothing.
   */
  readonly onOpen?: () => void;
  /**
   * Override copy behavior. When omitted the row writes `url` to the
   * clipboard via `navigator.clipboard.writeText`. The "copied" tick
   * lasts 1.2s either way.
   */
  readonly onCopy?: () => void;
  readonly className?: string;
}

/**
 * SmartLinkRow — pill-shaped row showing a smart-link URL with copy
 * and open affordances. Used inside an entity drawer's Overview tab to
 * surface the public share URL for that entity. The component owns its
 * own "copied" state and 1.2s reset timer.
 *
 * @example
 * ```tsx
 * <SmartLinkRow
 *   url={`jov.ie/${slug}`}
 *   onOpen={() => window.open(`https://jov.ie/${slug}`, '_blank')}
 * />
 * ```
 */
export function SmartLinkRow({
  url,
  onOpen,
  onCopy,
  className,
}: SmartLinkRowProps) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    if (onCopy) {
      onCopy();
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 h-7 pl-3 pr-1 rounded-full border border-(--linear-app-shell-border) bg-(--surface-0)/60 text-[11.5px] text-tertiary-token transition-colors duration-150 ease-out',
        className
      )}
    >
      <LinkIcon
        className='h-3 w-3 text-quaternary-token shrink-0'
        strokeWidth={2.25}
      />
      <span className='flex-1 truncate font-mono tabular-nums'>{url}</span>
      <Tooltip label={copied ? 'Copied' : 'Copy smart link'}>
        <button
          type='button'
          onClick={handleCopy}
          className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
          aria-label={copied ? 'Copied' : 'Copy smart link'}
          aria-live='polite'
        >
          <CopyToggleIcon copied={copied} />
        </button>
      </Tooltip>
      {onOpen && (
        <Tooltip label='Open smart link'>
          <button
            type='button'
            onClick={onOpen}
            className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
            aria-label='Open smart link'
          >
            <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
