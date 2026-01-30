'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Header section of the release sidebar with action buttons
 */

import { Check, Copy, ExternalLink, Hash, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

import type { Release } from './types';

interface ReleaseSidebarHeaderProps {
  readonly release: Release | null;
  readonly hasRelease: boolean;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
  readonly onCopySmartLink: () => void;
}

export function ReleaseSidebarHeader({
  release,
  hasRelease,
  onClose,
  onRefresh,
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

  // Define actions based on pattern from ContactSidebarHeader:
  // Primary: Close + Copy
  // Overflow: Refresh + Open
  const primaryActions: DrawerHeaderAction[] = [];
  const overflowActions: DrawerHeaderAction[] = [];

  // Close is always primary
  if (onClose) {
    primaryActions.push({
      id: 'close',
      label: 'Close release sidebar',
      icon: X,
      onClick: onClose,
    });
  }

  if (showActions) {
    // Copy smart link - primary action
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy smart link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopySmartLink,
    });

    // Refresh - overflow action
    overflowActions.push({
      id: 'refresh',
      label: 'Refresh release',
      icon: RefreshCw,
      onClick: () => {
        if (onRefresh) {
          onRefresh();
          return;
        }
        globalThis.location.reload();
      },
    });

    // Open smart link - overflow action
    overflowActions.push({
      id: 'open',
      label: 'Open smart link',
      icon: ExternalLink,
      href: release.smartLinkPath,
    });
  }

  // Copy release ID - available for all releases with an ID
  if (hasRelease && release?.id) {
    overflowActions.push({
      id: 'copy-id',
      label: 'Copy release ID',
      icon: Hash,
      onClick: () => {
        navigator.clipboard.writeText(release.id).catch(() => {
          // Silently fail - clipboard may not be available
        });
      },
    });
  }

  return (
    <div className='flex items-center justify-between px-3 py-2'>
      <p className='text-xs font-medium text-sidebar-foreground truncate'>
        {hasRelease ? 'Release details' : 'No release selected'}
      </p>
      <DrawerHeaderActions
        primaryActions={primaryActions}
        overflowActions={overflowActions}
      />
    </div>
  );
}
