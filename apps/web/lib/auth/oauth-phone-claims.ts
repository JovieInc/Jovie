/** Standard OIDC phone claims, released only when the client was granted phone. */
export function getOAuthPhoneClaims(
  user: Record<string, unknown>,
  scopes: readonly string[]
): Record<string, string | boolean> {
  if (!scopes.includes('phone') || typeof user.phoneNumber !== 'string') {
    return {};
  }

  return {
    phone_number: user.phoneNumber,
    phone_number_verified: user.phoneNumberVerified === true,
  };
}
