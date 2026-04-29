'use client';

/**
 * ReleaseSidebarHeader
 *
 * Provides title and action buttons for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */

import { Check, Hash, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';

import type { Release } from './types';

interface UseReleaseHeaderResult {
  readonly headerLabel: string;
  readonly primaryActions: DrawerHeaderAction[];
  readonly overflowActions: DrawerHeaderAction[];
}

interface UseReleaseHeaderPartsProps {
  readonly release: Release | null;
  readonly hasRelease: boolean;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
}

/**
 * Hook that returns the title and actions for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 */
export function useReleaseHeaderParts({
  release,
  hasRelease,
  onRefresh,
  isRefreshing = false,
}: UseReleaseHeaderPartsProps): UseReleaseHeaderResult {
  const showActions = hasRelease && release?.smartLinkPath;
  const [isIdCopied, setIsIdCopied] = useState(false);
  const idCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
    };
  }, []);

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
      toast.error('No release ID available to copy.');
      return;
    }
    try {
      await navigator.clipboard?.writeText(releaseId);
      setIsIdCopied(true);
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
      idCopyTimeoutRef.current = setTimeout(() => setIsIdCopied(false), 2000);
    } catch {
      toast.error(
        'Failed to copy the release ID. Your browser may not allow clipboard access.'
      );
    }
  }, [release]);

  const primaryActions: DrawerHeaderAction[] = [];
  const overflowActions: DrawerHeaderAction[] = [];

  if (showActions) {
    overflowActions.push({
      id: 'refresh',
      label: isRefreshing ? 'Refreshing release…' : 'Refresh release',
      icon: RefreshCw,
      onClick: handleRefreshClick,
    });
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

  return {
    headerLabel: '',
    primaryActions,
    overflowActions,
  };
}
