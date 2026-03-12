'use client';

/**
 * ReleaseSidebarHeader
 *
 * Provides title and action buttons for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */

import { Check, Copy, ExternalLink, Hash, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

import type { Release } from './types';

interface UseReleaseHeaderResult {
  title: ReactNode;
  actions: ReactNode | undefined;
}

interface UseReleaseHeaderPartsProps {
  readonly release: Release | null;
  readonly hasRelease: boolean;
  readonly artistName?: string;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
  readonly onCopySmartLink: () => void;
  readonly onClose?: () => void;
}

function buildTitleText(
  isrcValue: string | null | undefined,
  hasRelease: boolean,
  release: Release | null
): string {
  if (isrcValue) return isrcValue;
  if (hasRelease && release?.title) return release.title;
  return 'No release selected';
}

/**
 * Hook that returns the title and actions for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */
export function useReleaseHeaderParts({
  release,
  hasRelease,
  artistName,
  onRefresh,
  isRefreshing = false,
  onCopySmartLink,
  onClose,
}: UseReleaseHeaderPartsProps): UseReleaseHeaderResult {
  const showActions = hasRelease && release?.smartLinkPath;
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isIdCopied, setIsIdCopied] = useState(false);
  const idCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
    };
  }, []);

  const handleCopySmartLink = useCallback(() => {
    onCopySmartLink();
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [onCopySmartLink]);

  const handleOpenSmartLink = useCallback(() => {
    if (!release?.smartLinkPath) return;
    globalThis.open(release.smartLinkPath, '_blank', 'noopener,noreferrer');
  }, [release?.smartLinkPath]);

  const handleRefreshClick = useCallback(() => {
    if (isRefreshing) return;
    if (onRefresh) {
      onRefresh();
      return;
    }
    globalThis.location.reload();
  }, [isRefreshing, onRefresh]);

  const handleCopyReleaseId = useCallback(async () => {
    const releaseId = release?.id ?? '';
    if (!releaseId) {
      alert('No release ID available to copy.');
      return;
    }
    try {
      await navigator.clipboard?.writeText(releaseId);
      setIsIdCopied(true);
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
      idCopyTimeoutRef.current = setTimeout(() => setIsIdCopied(false), 2000);
    } catch {
      alert(
        'Failed to copy the release ID. Your browser may not allow clipboard access.'
      );
    }
  }, [release]);

  const overflowActions: DrawerHeaderAction[] = [];

  if (showActions) {
    /* eslint-disable react-hooks/refs -- Lucide icons are forwardRef components, not React refs */
    overflowActions.push(
      {
        id: 'copy',
        label: isCopied ? 'Copied!' : 'Copy smart link',
        icon: Copy,
        activeIcon: Check,
        isActive: isCopied,
        onClick: handleCopySmartLink,
      },
      {
        id: 'open',
        label: 'Open smart link',
        icon: ExternalLink,
        onClick: handleOpenSmartLink,
      },
      {
        id: 'refresh',
        label: isRefreshing ? 'Refreshing release…' : 'Refresh release',
        icon: RefreshCw,
        onClick: handleRefreshClick,
      }
    );
    /* eslint-enable react-hooks/refs */
  }

  if (hasRelease && release?.id) {
    /* eslint-disable-next-line react-hooks/refs -- Lucide icons are forwardRef components, not React refs */
    overflowActions.push({
      id: 'copy-id',
      label: isIdCopied ? 'Copied!' : 'Copy release ID',
      icon: Hash,
      activeIcon: Check,
      isActive: isIdCopied,
      onClick: handleCopyReleaseId,
    });
  }

  const isrcValue = hasRelease ? release?.primaryIsrc : undefined;
  const titleText = buildTitleText(isrcValue, hasRelease, release);

  const handleCopyIsrc = useCallback(async () => {
    if (!isrcValue) return;
    try {
      await navigator.clipboard?.writeText(isrcValue);
      setIsIdCopied(true);
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
      idCopyTimeoutRef.current = setTimeout(() => setIsIdCopied(false), 2000);
    } catch {}
  }, [isrcValue]);

  const title = (
    <span className='group/isrc flex min-w-0 items-center gap-1'>
      <span className='truncate font-mono text-[11px] tracking-[0.04em] text-(--linear-text-tertiary)'>
        {titleText}
      </span>
      {isrcValue && (
        <button
          type='button'
          onClick={handleCopyIsrc}
          title={isIdCopied ? 'Copied!' : 'Copy ISRC'}
          className='shrink-0 rounded-[6px] border border-transparent p-0.5 text-(--linear-text-quaternary) opacity-0 transition-[opacity,background-color,border-color,color] duration-150 group-hover/isrc:opacity-100 group-focus-within/isrc:opacity-100 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:opacity-100 focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          {isIdCopied ? (
            <Check className='h-3 w-3' />
          ) : (
            <Copy className='h-3 w-3' />
          )}
        </button>
      )}
    </span>
  );

  const actions =
    overflowActions.length > 0 || onClose ? (
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={overflowActions}
        onClose={onClose}
      />
    ) : undefined;

  return { title, actions };
}
