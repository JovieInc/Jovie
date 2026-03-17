'use client';

/**
 * ClaimLinkCopyButton - Deprecated
 *
 * Claim tokens are now hashed at rest (JOV-412). The raw token is only
 * available at generation time and sent via email. Admin users should
 * use the "Send Claim Invite" action to deliver claim links.
 */
export interface ClaimLinkCopyButtonProps
  extends Readonly<{
    readonly claimToken: string;
    readonly username: string;
  }> {}

export function ClaimLinkCopyButton({
  claimToken,
}: Readonly<ClaimLinkCopyButtonProps>) {
  // After hashing, the stored value is a hash — not a usable claim token.
  // Claim links can only be sent via email at token generation time.
  if (!claimToken) {
    return null;
  }

  return (
    <span
      className='text-xs text-tertiary-token'
      title='Claim token is hashed. Use "Send Claim Invite" to deliver claim links.'
    >
      Token hashed
    </span>
  );
}
