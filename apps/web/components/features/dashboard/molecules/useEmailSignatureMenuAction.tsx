'use client';

import { Mail } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import type { EmailSignatureInput } from '@/lib/email-signature/build-signature';
import { EmailSignatureDialog } from './EmailSignatureDialog';

interface UseEmailSignatureMenuActionResult {
  readonly action: DrawerHeaderAction;
  readonly modal: ReactNode;
  readonly open: () => void;
}

/**
 * Returns an overflow-menu action + the modal element that opens when the
 * action is selected. Render `modal` somewhere in the same tree so the
 * preview dialog can mount.
 */
export function useEmailSignatureMenuAction(
  input: EmailSignatureInput | null
): UseEmailSignatureMenuActionResult {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const action = useMemo<DrawerHeaderAction>(
    () => ({
      id: 'email-signature',
      label: 'Email signature',
      icon: Mail,
      disabled: input === null,
      onClick: open,
    }),
    [input, open]
  );

  const modal = (
    <EmailSignatureDialog open={isOpen} onClose={close} input={input} />
  );

  return { action, modal, open };
}
