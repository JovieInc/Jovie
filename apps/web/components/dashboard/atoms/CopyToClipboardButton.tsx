'use client';

import {
  CopyToClipboardButton as CopyToClipboardButtonMolecule,
  type CopyToClipboardButtonProps as CopyToClipboardButtonMoleculeProps,
} from '@/components/dashboard/molecules/CopyToClipboardButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';

export type CopyToClipboardButtonProps = Omit<
  CopyToClipboardButtonMoleculeProps,
  'onCopySuccess' | 'onCopyError'
>;

export function CopyToClipboardButton(props: CopyToClipboardButtonProps) {
  const notifications = useNotifications();

  return (
    <CopyToClipboardButtonMolecule
      {...props}
      onCopySuccess={() => {
        notifications.success('Copied to clipboard', { duration: 2000 });
        track('profile_copy_url_click', { status: 'success' });
      }}
      onCopyError={() => {
        notifications.error('Failed to copy');
        track('profile_copy_url_click', { status: 'error' });
      }}
    />
  );
}

CopyToClipboardButton.displayName = 'CopyToClipboardButton';
