'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Header section of the release sidebar with action buttons.
 * Uses the shared DrawerHeader shell for consistent styling.
 */

import { Check, Copy, ExternalLink, Hash, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawerHeader } from '@/components/molecules/drawer';
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

  const primaryActions: DrawerHeaderAction[] = [];
  const overflowActions: DrawerHeaderAction[] = [];

  if (showActions) {
    // Copy smart link - primary action
    // eslint-disable-next-line react-hooks/refs -- Lucide icons are forwardRef components, not React refs
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy smart link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopySmartLink,
    });

    // Refresh - overflow action
    // Open smart link - overflow action
    overflowActions.push(
      {
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
      },
      {
        id: 'open',
        label: 'Open smart link',
        icon: ExternalLink,
        href: release?.smartLinkPath,
      }
    );
  }

  // Copy release ID - available for all releases with an ID
  if (hasRelease && release?.id) {
    overflowActions.push({
      id: 'copy-id',
      label: 'Copy release ID',
      icon: Hash,
      onClick: () => {
        navigator.clipboard.writeText(release?.id ?? '').catch(() => {
          // Silently fail - clipboard may not be available
        });
      },
    });
  }

  const hasActions = primaryActions.length > 0 || overflowActions.length > 0;

  return (
    <DrawerHeader
      title={hasRelease ? 'Release details' : 'No release selected'}
      onClose={onClose}
      actions={
        hasActions ? (
          <DrawerHeaderActions
            primaryActions={primaryActions}
            overflowActions={overflowActions}
          />
        ) : undefined
      }
    />
  );
}
