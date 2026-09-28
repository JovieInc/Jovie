import { authClient } from '@/lib/auth/client';
import { isDesktopEnvironment } from '@/lib/desktop/electron-bridge';

/**
 * Passkey / Touch ID step-up shared by the workspace lock screen and the
 * legacy admin step-up banner. First use enrolls a passkey (needs a sign-in
 * from the last 10 minutes), then signs in with it; the new session carries
 * a 12-hour admin step-up.
 */

/** A ceremony that stays pending this long means the prompt never appeared. */
export const PASSKEY_STEP_UP_TIMEOUT_MS = 90_000;
/** Platform-authenticator probe budget; the call can hang in Electron. */
const PLATFORM_AUTHENTICATOR_PROBE_MS = 5_000;
/** Confirms the server recorded the step-up for the new session. */
const STEP_UP_STATUS_PATH = '/api/admin/step-up-status';

export type PasskeyStepUpErrorCode =
  | 'unsupported'
  | 'timeout'
  | 'admin-factor-missing'
  | 'unconfirmed';

export class PasskeyStepUpError extends Error {
  readonly code: PasskeyStepUpErrorCode;

  constructor(code: PasskeyStepUpErrorCode, message: string) {
    super(message);
    this.name = 'PasskeyStepUpError';
    this.code = code;
  }
}

const UNSUPPORTED_DESKTOP_MESSAGE =
  'This Jovie app cannot show the passkey prompt yet. Open Jovie in your browser to unlock.';
const UNSUPPORTED_BROWSER_MESSAGE =
  'This browser cannot show the passkey prompt. Try a current version of Chrome, Edge, or Safari.';
const TIMEOUT_MESSAGE =
  'The passkey prompt did not appear. Make sure the window is focused, then try again.';
const ADMIN_FACTOR_MISSING_MESSAGE =
  'That passkey can sign you in but cannot unlock admin access. Use the passkey you set up first.';
const UNCONFIRMED_MESSAGE =
  'Could not confirm the unlock. Check your connection and try again.';

/** E2E hook (`__JOVIE_*` convention) so specs do not wait 90s. */
function stepUpTimeoutMs(): number {
  const override = (
    globalThis as { __JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__?: unknown }
  ).__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__;
  return typeof override === 'number' && override > 0
    ? override
    : PASSKEY_STEP_UP_TIMEOUT_MS;
}

function withTimeout<T>(
  pending: Promise<T>,
  timeoutError = new PasskeyStepUpError('timeout', TIMEOUT_MESSAGE)
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError), stepUpTimeoutMs());
    pending.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

/**
 * Fails fast when this context cannot raise a WebAuthn ceremony at all. In
 * the Electron shell the platform-authenticator call hangs without
 * `app.configureWebAuthn` (blocked on the keychain entitlement — see
 * docs/macos/desktop-auth.md), so probe it with a hard budget instead of
 * letting "Waiting for passkey…" sit forever.
 */
async function assertCeremonyCanRun(): Promise<void> {
  const supported =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.get === 'function';
  if (!supported) {
    throw new PasskeyStepUpError(
      'unsupported',
      isDesktopEnvironment()
        ? UNSUPPORTED_DESKTOP_MESSAGE
        : UNSUPPORTED_BROWSER_MESSAGE
    );
  }

  if (!isDesktopEnvironment()) return;

  const probe =
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
  const available =
    typeof probe === 'function'
      ? await Promise.race([
          probe.call(window.PublicKeyCredential).catch(() => false),
          new Promise<boolean>(resolve =>
            setTimeout(
              () => resolve(false),
              Math.min(PLATFORM_AUTHENTICATOR_PROBE_MS, stepUpTimeoutMs())
            )
          ),
        ])
      : false;
  if (!available) {
    throw new PasskeyStepUpError('unsupported', UNSUPPORTED_DESKTOP_MESSAGE);
  }
}

/**
 * A passkey sign-in mints a new session, but only admin-factor credentials
 * get a step-up receipt — a device-only passkey silently loops the user back
 * to the lock. Confirm the receipt exists before reloading so that case
 * shows an actionable error instead (JOV-6892).
 */
async function assertStepUpActive(): Promise<void> {
  let body: { unlocked?: boolean } | null = null;
  try {
    const response = await withTimeout(
      fetch(STEP_UP_STATUS_PATH, {
        credentials: 'same-origin',
        cache: 'no-store',
      }),
      new PasskeyStepUpError('unconfirmed', UNCONFIRMED_MESSAGE)
    );
    body = response.ok
      ? ((await response.json()) as { unlocked?: boolean })
      : null;
  } catch (error) {
    if (error instanceof PasskeyStepUpError) throw error;
    throw new PasskeyStepUpError('unconfirmed', UNCONFIRMED_MESSAGE);
  }
  if (body?.unlocked !== true) {
    throw new PasskeyStepUpError(
      'admin-factor-missing',
      ADMIN_FACTOR_MISSING_MESSAGE
    );
  }
}

export async function unlockWithPasskey(): Promise<void> {
  await assertCeremonyCanRun();

  const listed = await withTimeout(authClient.passkey.listUserPasskeys());
  if (listed.error) throw new Error(listed.error.message);
  if ((listed.data ?? []).length === 0) {
    const added = await withTimeout(
      authClient.passkey.addPasskey({ name: 'Ovie' })
    );
    if (added?.error) throw new Error(added.error.message);
  }

  const signedIn = await withTimeout(authClient.signIn.passkey());
  if (signedIn?.error) throw new Error(signedIn.error.message);

  await assertStepUpActive();
}
