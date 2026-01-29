'use client';

import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';

export interface ClaimLinkCopyButtonProps
  extends Readonly<{
    claimToken: string;
  }> {}

export function ClaimLinkCopyButton({ claimToken }: ClaimLinkCopyButtonProps) {
  if (!claimToken) {
    return null;
  }

  return (
    <CopyToClipboardButton
      relativePath={`/claim/${claimToken}`}
      idleLabel='Copy claim link'
      successLabel='✓ Link copied!'
      errorLabel='Failed to copy'
    />
  );
}
