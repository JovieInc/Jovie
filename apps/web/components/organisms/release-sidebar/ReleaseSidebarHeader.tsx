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

  const handleCopyReleaseId = useCallback(() => {
    const releaseId = release?.id ?? '';
    if (!releaseId) {
      alert('No release ID available to copy.');
      return;
    }

    navigator.clipboard
      ?.writeText(releaseId)
      .then(() => {
        setIsIdCopied(true);
        if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
        idCopyTimeoutRef.current = setTimeout(() => setIsIdCopied(false), 2000);
      })
      .catch(() => {
        alert(
          'Failed to copy the release ID. Your browser may not allow clipboard access.'
        );
      });
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
        onClick: () => {
          if (!release?.smartLinkPath) return;
          globalThis.open(
            release.smartLinkPath,
            '_blank',
            'noopener,noreferrer'
          );
        },
      },
      {
        id: 'refresh',
        label: isRefreshing ? 'Refreshing release…' : 'Refresh release',
        icon: RefreshCw,
        onClick: () => {
          if (isRefreshing) return;
          if (onRefresh) {
            onRefresh();
            return;
          }
          globalThis.location.reload();
        },
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

  const titleText =
    hasRelease && release?.title ? release.title : 'No release selected';

  const title = (
    <span className='min-w-0'>
      <span className='block truncate'>{titleText}</span>
      {artistName && (
        <span className='block truncate text-[11px] font-normal text-secondary-token'>
          {artistName}
        </span>
      )}
    </span>
  );

  const actions =
    overflowActions.length > 0 ? (
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={overflowActions}
      />
    ) : undefined;

  return { title, actions };
}
