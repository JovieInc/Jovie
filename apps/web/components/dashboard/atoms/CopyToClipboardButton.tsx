'use client';

import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  CopyToClipboardButton as CopyToClipboardButtonMolecule,
  type CopyToClipboardButtonProps as CopyToClipboardButtonMoleculeProps,
} from '@/components/dashboard/molecules/CopyToClipboardButton';
import { track } from '@/lib/analytics';

/**
 * @deprecated This component is a wrapper that adds business logic (analytics tracking).
 * For new code, use the molecule version directly and handle tracking in the parent component.
 * This wrapper exists for backward compatibility.
 */
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
