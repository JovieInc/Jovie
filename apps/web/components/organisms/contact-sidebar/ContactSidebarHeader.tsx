'use client';

/**
 * ContactSidebarHeader Component
 *
 * Header section of the contact sidebar with action buttons
 */

import { Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

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
  const showActions = hasContact && contact?.username;

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
      label: 'Copy profile link',
      icon: Copy,
      onClick: onCopyProfileUrl,
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
      <p className='text-xs text-sidebar-muted'>
        {hasContact ? `ID: ${contact?.id}` : 'No contact selected'}
      </p>
      <DrawerHeaderActions
        primaryActions={primaryActions}
        overflowActions={overflowActions}
      />
    </div>
  );
}
