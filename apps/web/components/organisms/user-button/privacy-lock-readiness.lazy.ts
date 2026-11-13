/**
 * The passkey readiness check only runs when someone turns the privacy lock
 * on. Importing unlock-with-passkey statically pulled its WebAuthn ceremony
 * code and desktop bridge into every page that renders the account menu, the
 * marketing homepage included, so it loads on demand instead.
 */
export async function ensurePrivacyLockCanBeEnabled(): Promise<void> {
  const passkey = await import('@/lib/workspace-lock/unlock-with-passkey');
  await passkey.ensurePrivacyLockCanBeEnabled();
}
