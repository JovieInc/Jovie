'use client';

/**
 * ContactSidebarHeader Component
 *
 * Header section of the contact sidebar with action buttons
 */

import { Check, Copy, ExternalLink, IdCard, RefreshCw, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { useNotifications } from '@/lib/hooks/useNotifications';

import type { Contact } from './types';

interface ContactSidebarHeaderProps {
  contact: Contact | null;
  hasContact: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
  onCopyProfileUrl: () => void;
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

  const handleCopyProfileUrl = useCallback(() => {
    onCopyProfileUrl();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [onCopyProfileUrl]);

  const handleCopyClerkId = async () => {
    if (!contact?.clerkId) return;
    try {
      await navigator.clipboard.writeText(contact.clerkId);
      notifications.success('Clerk ID copied');
      setIsClerkIdCopied(true);
      setTimeout(() => setIsClerkIdCopied(false), 2000);
    } catch {
      notifications.error('Failed to copy');
    }
  };

  // Define actions based on plan:
  // Primary: Close + Copy
  // Overflow: Refresh + Open
  const primaryActions: DrawerHeaderAction[] = [];
  const overflowActions: DrawerHeaderAction[] = [];

  // Close is always primary
  if (onClose) {
    primaryActions.push({
      id: 'close',
      label: 'Close contact sidebar',
      icon: X,
      onClick: onClose,
    });
  }

  if (showActions) {
    // Copy profile link - primary action
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy profile link',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopyProfileUrl,
    });

    // Refresh - overflow action
    overflowActions.push({
      id: 'refresh',
      label: 'Refresh profile',
      icon: RefreshCw,
      onClick: () => {
        if (onRefresh) {
          onRefresh();
          return;
        }
        window.location.reload();
      },
    });

    // Open profile - overflow action
    overflowActions.push({
      id: 'open',
      label: 'Open profile',
      icon: ExternalLink,
      href: `/${contact!.username}`,
    });
  }

  return (
    <div className='flex items-center justify-between px-3 py-2'>
      <div className='flex items-center gap-1'>
        <p className='text-xs text-sidebar-muted'>
          {hasContact ? 'Contact' : 'No contact selected'}
        </p>
        {hasContact && contact?.clerkId && (
          <button
            type='button'
            onClick={handleCopyClerkId}
            className={
              isClerkIdCopied
                ? 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400 transition-colors'
                : 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors'
            }
            aria-label='Copy Clerk ID'
          >
            <span className='relative flex h-3 w-3 items-center justify-center'>
              <IdCard
                className={`absolute h-3 w-3 transition-all duration-150 ${
                  isClerkIdCopied
                    ? 'scale-50 opacity-0'
                    : 'scale-100 opacity-100'
                }`}
              />
              <Check
                className={`absolute h-3 w-3 transition-all duration-150 ${
                  isClerkIdCopied
                    ? 'scale-100 opacity-100'
                    : 'scale-50 opacity-0'
                }`}
              />
            </span>
            <span>{isClerkIdCopied ? 'Copied!' : 'Copy ID'}</span>
          </button>
        )}
      </div>
      <DrawerHeaderActions
        primaryActions={primaryActions}
        overflowActions={overflowActions}
      />
    </div>
  );
}
