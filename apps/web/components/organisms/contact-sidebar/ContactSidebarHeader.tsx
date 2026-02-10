'use client';

/**
 * ContactSidebarHeader Component
 *
 * Header section of the contact sidebar with action buttons.
 * Uses the shared DrawerHeader shell for consistent styling.
 */

import { Check, Copy, ExternalLink, IdCard, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawerHeader } from '@/components/molecules/drawer';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useNotifications } from '@/lib/hooks/useNotifications';

import type { Contact } from './types';

interface ContactSidebarHeaderProps {
  readonly contact: Contact | null;
  readonly hasContact: boolean;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
  readonly onCopyProfileUrl: () => void;
}

export function ContactSidebarHeader({
  contact,
  hasContact,
  onClose,
  onRefresh,
  onCopyProfileUrl,
}: ContactSidebarHeaderProps) {
  const notifications = useNotifications();
  const showActions = hasContact && contact?.username;
  const [isCopied, setIsCopied] = useState(false);
  const [isClerkIdCopied, setIsClerkIdCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clerkIdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (clerkIdTimeoutRef.current) clearTimeout(clerkIdTimeoutRef.current);
    };
  }, []);

  const handleCopyProfileUrl = useCallback(() => {
    onCopyProfileUrl();
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [onCopyProfileUrl]);

  const handleCopyClerkId = async () => {
    if (!contact?.clerkId) return;
    try {
      await navigator.clipboard.writeText(contact.clerkId);
      notifications.success('Clerk ID copied');
      setIsClerkIdCopied(true);
      if (clerkIdTimeoutRef.current) clearTimeout(clerkIdTimeoutRef.current);
      clerkIdTimeoutRef.current = setTimeout(
        () => setIsClerkIdCopied(false),
        2000
      );
    } catch {
      notifications.error('Failed to copy');
    }
  };

  const primaryActions: DrawerHeaderAction[] = [];
  const overflowActions: DrawerHeaderAction[] = [];

  if (showActions) {
    // Copy profile link - primary action
    // eslint-disable-next-line react-hooks/refs -- Lucide icons are forwardRef components, not React refs
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy profile link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopyProfileUrl,
    });

    // Refresh - overflow action
    // Open profile - overflow action
    overflowActions.push(
      {
        id: 'refresh',
        label: 'Refresh profile',
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
        label: 'Open profile',
        icon: ExternalLink,
        href: `/${contact?.username}`,
      }
    );
  }

  const hasActions = primaryActions.length > 0 || overflowActions.length > 0;

  // Build title with optional Clerk ID copy button
  const titleContent =
    hasContact && contact?.clerkId ? (
      <span className='flex items-center gap-1'>
        <span>{hasContact ? 'Contact' : 'No contact selected'}</span>
        <button
          type='button'
          onClick={handleCopyClerkId}
          className={
            isClerkIdCopied
              ? 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400 transition-colors'
              : 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-secondary-token hover:bg-surface-2 hover:text-primary-token transition-colors'
          }
          aria-label='Copy Clerk ID'
        >
          <span className='relative flex h-3 w-3 items-center justify-center'>
            <IdCard
              className={`absolute h-3 w-3 transition-all duration-150 ${
                isClerkIdCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
              }`}
            />
            <Check
              className={`absolute h-3 w-3 transition-all duration-150 ${
                isClerkIdCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
            />
          </span>
          <span>{isClerkIdCopied ? 'Copied!' : 'Copy ID'}</span>
        </button>
      </span>
    ) : hasContact ? (
      'Contact'
    ) : (
      'No contact selected'
    );

  return (
    <DrawerHeader
      title={titleContent}
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
