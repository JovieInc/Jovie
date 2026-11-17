'use client';

import { Button } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { deriveNativeUri } from '@/lib/links/destination-links';
import { cn } from '@/lib/utils';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu';

export interface DspQuietRowProps
  extends Pick<
    ComponentPropsWithRef<'div'>,
    | 'ref'
    | 'onPointerEnter'
    | 'onPointerLeave'
    | 'onFocusCapture'
    | 'onBlurCapture'
    | 'children'
  > {
  readonly label: string;
  readonly icon: ReactNode;
  readonly href?: string | null;
  readonly onFind?: () => void;
  readonly findLabel?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly closedTabIndex?: number;
  /** Show the saved URL beside the name (link lists that review URLs). */
  readonly showUrl?: boolean;
  readonly 'data-destination-preview'?: boolean;
  /**
   * Prebuilt Jovie link (with this destination's UTM attribution) offered
   * as 'Copy Jovie link' in the row's action menu.
   */
  readonly jovieLinkUrl?: string;
}

/** Saved DSP URL without protocol, `www.` or a trailing slash. */
export function displayDspUrl(href: string): string {
  return href
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

const DSP_QUIET_ROW_CLASS =
  'group flex min-h-8 items-center gap-2 rounded-md px-0 transition-colors duration-subtle hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55';

/** Copy to the clipboard; toast the outcome either way. */
function copyText(
  value: string,
  notifications: ReturnType<typeof useNotifications>,
  successMessage: string
): void {
  navigator.clipboard
    .writeText(value)
    .then(() => notifications.success(successMessage))
    .catch(() => notifications.error('Could not copy to the clipboard'));
}

/** Track/release DSP row: name + actions, or Find when the provider is not found.
 *
 * Destination-row interaction contract (founder note 2026-11-09): a linked
 * destination row never shows a bare open-link icon as its only control.
 * App previews compose through DspEntityRow; marketing keeps this shared row.
 * The trailing menu carries Open / Copy Link / Copy Jovie Link (UTM) /
 * Copy the platform-native URI when the network has one.
 */
export function DspQuietRow({
  label,
  icon,
  href,
  onFind,
  findLabel = 'Find',
  className,
  testId,
  closedTabIndex,
  showUrl = false,
  jovieLinkUrl,
  children,
  ...rowProps
}: DspQuietRowProps) {
  const notifications = useNotifications();
  const hasHref = Boolean(href?.trim());

  if (hasHref && href) {
    const nativeUri = deriveNativeUri(href);
    const copyRow = (value: string, successMessage: string) => () =>
      copyText(value, notifications, successMessage);
    const menuItems: OverflowMenuItem[] = [
      {
        id: 'open',
        label: 'Open',
        icon: (
          <ExternalLink
            className='h-3 w-3'
            strokeWidth={2.25}
            aria-hidden='true'
          />
        ),
        onSelect: () => {
          globalThis.open(href, '_blank', 'noopener,noreferrer');
        },
      },
      {
        id: 'copy-link',
        label: 'Copy Link',
        onSelect: copyRow(href, `${label} link copied`),
      },
      ...(jovieLinkUrl
        ? [
            {
              id: 'copy-jovie-link',
              label: 'Copy Jovie Link With UTM',
              onSelect: copyRow(jovieLinkUrl, 'Jovie link copied'),
            },
          ]
        : []),
      ...(nativeUri
        ? [
            {
              id: 'copy-native-uri',
              label: 'Copy Platform URI',
              onSelect: copyRow(nativeUri, `${label} URI copied`),
            },
          ]
        : []),
    ];

    return (
      <div
        {...rowProps}
        data-testid={testId}
        className={cn(DSP_QUIET_ROW_CLASS, className)}
      >
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          tabIndex={closedTabIndex}
          data-dsp-row='linked'
          // The focusable element owns the canonical DSP-row ring (no
          // offset; focus-visible:bg-surface-1 replaces it) even though the
          // hover group lives on the wrapper.
          className='flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
        >
          <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
            {icon}
          </span>
          <span
            className={cn(
              'min-w-0 truncate text-xs text-primary-token',
              showUrl ? 'w-24 shrink-0' : 'flex-1'
            )}
          >
            {label}
          </span>
          {showUrl ? (
            <span className='min-w-0 flex-1 truncate font-mono text-2xs text-tertiary-token'>
              {displayDspUrl(href)}
            </span>
          ) : null}
        </a>
        <span
          className={cn(
            'flex shrink-0 transition-opacity duration-subtle',
            !showUrl &&
              'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          )}
        >
          <OverflowMenu
            label={`Destination actions for ${label}`}
            items={menuItems}
            testId={testId ? `${testId}-actions` : undefined}
            triggerTabIndex={closedTabIndex}
          />
        </span>
        {children}
      </div>
    );
  }

  return (
    <div
      {...rowProps}
      data-testid={testId}
      data-dsp-row='missing'
      className={cn(DSP_QUIET_ROW_CLASS, className)}
    >
      <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
        {icon}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-xs text-secondary-token',
          showUrl ? 'w-24 shrink-0' : 'flex-1'
        )}
      >
        {label}
      </span>
      {showUrl ? <span className='flex-1' /> : null}
      {onFind ? (
        <Button
          type='button'
          variant='link'
          onClick={onFind}
          tabIndex={closedTabIndex}
          className='shrink-0 text-2xs font-medium text-secondary-token hover:text-primary-token focus-visible:ring-2 focus-visible:ring-ring/55'
        >
          {findLabel}
        </Button>
      ) : null}
    </div>
  );
}
