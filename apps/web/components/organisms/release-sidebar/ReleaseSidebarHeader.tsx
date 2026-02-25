'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Header section of the release sidebar with action buttons.
 * Uses the shared DrawerHeader shell for consistent styling.
 */

import { SegmentControl } from '@jovie/ui';
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
  readonly isRefreshing?: boolean;
  readonly onCopySmartLink: () => void;
  readonly panelMode: 'edit' | 'live';
  readonly onPanelModeChange: (mode: 'edit' | 'live') => void;
}

export function ReleaseSidebarHeader({
  release,
  hasRelease,
  onClose,
  onRefresh,
  isRefreshing = false,
  onCopySmartLink,
  panelMode,
  onPanelModeChange,
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
    // Copy smart link + Open smart link - primary actions
    /* eslint-disable react-hooks/refs -- Lucide icons are forwardRef components, not React refs */
    primaryActions.push(
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

    // Refresh - overflow action
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

  // Copy release ID - available for all releases with an ID
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

  const hasActions = primaryActions.length > 0 || overflowActions.length > 0;

  return (
    <DrawerHeader
      title={hasRelease ? 'Release details' : 'No release selected'}
      onClose={hasActions ? undefined : onClose}
      actions={
        <div className='flex items-center gap-2'>
          {hasRelease && (
            <SegmentControl
              value={panelMode}
              onValueChange={onPanelModeChange}
              options={[
                { value: 'edit', label: 'Edit' },
                { value: 'live', label: 'Live' },
              ]}
              size='sm'
              aria-label='Sidebar mode'
            />
          )}
          {hasActions ? (
            <DrawerHeaderActions
              primaryActions={primaryActions}
              overflowActions={overflowActions}
              onClose={onClose}
            />
          ) : undefined}
        </div>
      }
    />
  );
}
