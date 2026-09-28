import { authClient } from '@/lib/auth/client';

/**
 * Passkey / Touch ID step-up shared by the workspace lock screen and the
 * legacy admin step-up banner. First use enrolls a passkey (needs a sign-in
 * from the last 10 minutes), then signs in with it; the new session carries
 * a 12-hour admin step-up.
 */
export async function unlockWithPasskey(): Promise<void> {
  const listed = await authClient.passkey.listUserPasskeys();
  if (listed.error) throw new Error(listed.error.message);
  if ((listed.data ?? []).length === 0) {
    const added = await authClient.passkey.addPasskey({ name: 'Ovie' });
    if (added?.error) throw new Error(added.error.message);
  }
  const signedIn = await authClient.signIn.passkey();
  if (signedIn?.error) throw new Error(signedIn.error.message);
}
