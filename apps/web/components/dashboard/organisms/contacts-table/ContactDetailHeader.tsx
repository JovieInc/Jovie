'use client';

import { Check, Copy, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { ContactRole } from '@/types/contacts';

interface UseContactDetailHeaderProps {
  readonly role: ContactRole;
  readonly customLabel?: string | null;
  readonly email?: string | null;
  readonly onDelete: () => void;
  readonly onClose?: () => void;
}

interface UseContactDetailHeaderResult {
  readonly title: string;
  readonly actions: ReactNode | undefined;
}

export function useContactDetailHeaderParts({
  role,
  customLabel,
  email,
  onDelete,
  onClose,
}: UseContactDetailHeaderProps): UseContactDetailHeaderResult {
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

  const primaryActions: DrawerHeaderAction[] = [];

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

  const hasActions = primaryActions.length > 0 || overflowActions.length > 0;

  return {
    title: roleLabel,
    actions:
      hasActions || onClose ? (
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
          onClose={onClose}
        />
      ) : undefined,
  };
}
