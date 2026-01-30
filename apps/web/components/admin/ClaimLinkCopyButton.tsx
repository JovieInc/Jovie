'use client';

import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';

export interface ClaimLinkCopyButtonProps
  extends Readonly<{
    readonly claimToken: string;
  }> {}

export function ClaimLinkCopyButton({
  claimToken,
}: Readonly<ClaimLinkCopyButtonProps>) {
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
