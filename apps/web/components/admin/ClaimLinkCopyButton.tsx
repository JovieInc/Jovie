'use client';

import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';

export interface ClaimLinkCopyButtonProps
  extends Readonly<{
    readonly claimToken: string;
    readonly username: string;
  }> {}

export function ClaimLinkCopyButton({
  claimToken,
  username,
}: Readonly<ClaimLinkCopyButtonProps>) {
  if (!claimToken) {
    return null;
  }

  return (
    <CopyToClipboardButton
      relativePath={`/${encodeURIComponent(username)}/claim?token=${encodeURIComponent(claimToken)}`}
      idleLabel='Copy claim link'
      successLabel='✓ Link copied!'
      errorLabel='Failed to copy'
    />
  );
}
