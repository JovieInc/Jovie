'use client';

import { Check, Copy, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { ContactRole } from '@/types/contacts';

interface ContactDetailHeaderProps {
  readonly role: ContactRole;
  readonly customLabel?: string | null;
  readonly email?: string | null;
  readonly onClose: () => void;
  readonly onDelete: () => void;
}

export function ContactDetailHeader({
  role,
  customLabel,
  email,
  onClose,
  onDelete,
}: ContactDetailHeaderProps) {
  const notifications = useNotifications();
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyEmail = useCallback(() => {
    if (!email) return;
    void navigator.clipboard.writeText(email);
    notifications.success('Email copied');
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [email, notifications]);

  const roleLabel = getContactRoleLabel(role, customLabel);

  const primaryActions: DrawerHeaderAction[] = [
    {
      id: 'close',
      label: 'Close',
      icon: X,
      onClick: onClose,
    },
  ];

  if (email) {
    // eslint-disable-next-line react-hooks/refs -- ref value read is intentional for action state
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy email',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopyEmail,
    });
  }

  const overflowActions: DrawerHeaderAction[] = [
    {
      id: 'delete',
      label: 'Delete contact',
      icon: Trash2,
      onClick: onDelete,
    },
  ];

  return (
    <div className='flex items-center justify-between px-3 py-2'>
      <p className='text-xs font-medium text-sidebar-foreground truncate'>
        {roleLabel}
      </p>
      <DrawerHeaderActions
        primaryActions={primaryActions}
        overflowActions={overflowActions}
      />
    </div>
  );
}
