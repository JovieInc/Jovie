'use client';

import { track } from '@/lib/analytics';
import { CopyToClipboardButton as CopyToClipboardButtonMolecule } from '@/components/dashboard/molecules/CopyToClipboardButton';
import type { CopyToClipboardButtonProps as CopyToClipboardButtonMoleculeProps } from '@/components/dashboard/molecules/CopyToClipboardButton';

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
  return (
    <CopyToClipboardButtonMolecule
      {...props}
      onCopySuccess={() => {
        track('profile_copy_url_click', { status: 'success' });
      }}
      onCopyError={() => {
        track('profile_copy_url_click', { status: 'error' });
      }}
    />
  );
}
