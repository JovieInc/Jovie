'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Demo-style header: release ID label on left, actions + close on right.
 * Matches the DemoReleaseDetail header pattern.
 */

import { Check, Copy, ExternalLink, Hash, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

import type { Release } from './types';

interface ReleaseSidebarHeaderProps {
  readonly release: Release | null;
  readonly hasRelease: boolean;
  readonly artistName?: string;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
  readonly onCopySmartLink: () => void;
}

export function ReleaseSidebarHeader({
  release,
  hasRelease,
  artistName,
  onClose,
  onRefresh,
  isRefreshing = false,
  onCopySmartLink,
}: ReleaseSidebarHeaderProps) {
  const showActions = hasRelease && release?.smartLinkPath;
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopySmartLink = useCallback(() => {
    onCopySmartLink();
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [onCopySmartLink]);

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
      }
    );
    /* eslint-enable react-hooks/refs */

    overflowActions.push({
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
    });
  }

  if (hasRelease && release?.id) {
    overflowActions.push({
      id: 'copy-id',
      label: 'Copy release ID',
      icon: Hash,
      onClick: () => {
        navigator.clipboard?.writeText(release?.id ?? '').catch(() => {
          // Silently fail - clipboard may not be available
        });
      },
    });
  }

  const titleText =
    hasRelease && release?.title ? release.title : 'No release selected';

  return (
    <div className='flex items-center justify-between border-b border-subtle px-4 py-2 min-h-12 shrink-0'>
      <div className='min-w-0 flex-1'>
        <div className='text-[13px] font-medium text-primary-token truncate'>
          {titleText}
        </div>
        {artistName && (
          <div className='text-[13px] text-secondary-token truncate'>
            {artistName}
          </div>
        )}
      </div>
      <div className='flex items-center gap-1'>
        {(overflowActions.length > 0 || onClose) && (
          <DrawerHeaderActions
            primaryActions={[]}
            overflowActions={overflowActions}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
