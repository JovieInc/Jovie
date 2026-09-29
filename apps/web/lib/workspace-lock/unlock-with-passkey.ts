import { authClient } from '@/lib/auth/client';
import { isDesktopEnvironment } from '@/lib/desktop/electron-bridge';
import { updateWorkspacePrivacyLock } from './workspace-lock';

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
  | 'cancelled'
  | 'setup-required'
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
const ENROLLMENT_CANCELLED_MESSAGE =
  'Passkey setup was canceled before it finished, so no passkey was saved. Try again, or choose a different authenticator.';
const SIGN_IN_CANCELLED_MESSAGE =
  'The passkey prompt was canceled. Try again to unlock.';
const SETUP_REQUIRED_MESSAGE =
  'The passkey offered by your password manager is not registered to this account. Try again to set up a new passkey, or choose a different authenticator.';
const PRIVACY_PASSKEY_REQUIRED_MESSAGE =
  'No passkey is registered for this Ovie account. Contact an admin to update the privacy-lock settings.';

/**
 * Provider codes for an authenticator abort before verified registration.
 * SimpleWebAuthn 13 passes user dismissals (NotAllowedError — the 1Password
 * cancel path) through as ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY rather than a
 * dedicated cancel code, so it maps to the same recoverable state.
 */
const CANCELLED_CODES = new Set([
  'AUTH_CANCELLED',
  'ERROR_CEREMONY_ABORTED',
  'REGISTRATION_CANCELLED',
  'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
]);
/**
 * The authenticator answered, but the server has no such credential — the
 * phantom state from a canceled enrollment (JOV-6892). Reconcile against
 * `listUserPasskeys` before claiming a passkey exists.
 */
const UNREGISTERED_CREDENTIAL_CODES = new Set([
  'PASSKEY_NOT_FOUND',
  'AUTHENTICATION_FAILED',
]);

type PasskeyError = { code?: string; message?: string } | null | undefined;

function passkeyErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function toStepUpError(
  error: PasskeyError,
  cancelledMessage: string
): PasskeyStepUpError | Error {
  const code = passkeyErrorCode(error);
  if (code && CANCELLED_CODES.has(code)) {
    return new PasskeyStepUpError('cancelled', cancelledMessage);
  }
  return new Error(error?.message || 'Passkey check did not complete.');
}

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

async function assertPrivacyLockUnlocked(): Promise<void> {
  const state = await withTimeout(
    updateWorkspacePrivacyLock('unlock'),
    new PasskeyStepUpError('unconfirmed', UNCONFIRMED_MESSAGE)
  );
  const unlockedUntil = state.unlockedUntil
    ? Date.parse(state.unlockedUntil)
    : Number.NaN;
  if (
    !state.enabled ||
    state.locked ||
    !Number.isFinite(unlockedUntil) ||
    unlockedUntil <= Date.now()
  ) {
    throw new PasskeyStepUpError('unconfirmed', UNCONFIRMED_MESSAGE);
  }
}

/**
 * Check that this runtime can present a passkey and this account already has
 * one before enabling privacy lock. This never enrolls credentials.
 */
export async function ensurePrivacyLockCanBeEnabled(): Promise<void> {
  await assertCeremonyCanRun();
  const listed = await withTimeout(authClient.passkey.listUserPasskeys());
  if (listed.error) {
    throw new PasskeyStepUpError('unconfirmed', listed.error.message);
  }
  if ((listed.data ?? []).length === 0) {
    throw new PasskeyStepUpError(
      'setup-required',
      PRIVACY_PASSKEY_REQUIRED_MESSAGE
    );
  }
}

export interface UnlockWithPasskeyOptions {
  /** Defaults to the existing Ovie admin step-up contract. */
  purpose?: 'admin' | 'privacy';
}

export async function unlockWithPasskey({
  purpose = 'admin',
}: UnlockWithPasskeyOptions = {}): Promise<void> {
  await assertCeremonyCanRun();

  const listed = await withTimeout(authClient.passkey.listUserPasskeys());
  if (listed.error) throw new Error(listed.error.message);
  if ((listed.data ?? []).length === 0 && purpose === 'privacy') {
    throw new PasskeyStepUpError(
      'setup-required',
      PRIVACY_PASSKEY_REQUIRED_MESSAGE
    );
  }
  if ((listed.data ?? []).length === 0) {
    const added = await withTimeout(
      authClient.passkey.addPasskey({ name: 'Ovie' })
    );
    // Better Auth writes the passkey row only after verified registration,
    // so a canceled/aborted ceremony (e.g. dismissing the 1Password prompt)
    // must never be projected as a saved credential (JOV-6892). Treat a
    // data-less result — error or not — as an aborted enrollment.
    if (added?.error || !added?.data) {
      throw added?.error
        ? toStepUpError(added.error, ENROLLMENT_CANCELLED_MESSAGE)
        : new PasskeyStepUpError('cancelled', ENROLLMENT_CANCELLED_MESSAGE);
    }
  }

  const signedIn = await withTimeout(authClient.signIn.passkey());
  if (signedIn?.error) {
    const code = passkeyErrorCode(signedIn.error);
    if (code && UNREGISTERED_CREDENTIAL_CODES.has(code)) {
      // The authenticator offered a credential the server never registered
      // (kept locally after a canceled enrollment). Reconcile against the
      // authoritative server list before claiming a usable passkey.
      const reconciled = await withTimeout(
        authClient.passkey.listUserPasskeys()
      );
      if ((reconciled.data ?? []).length === 0) {
        throw new PasskeyStepUpError('setup-required', SETUP_REQUIRED_MESSAGE);
      }
    }
    throw toStepUpError(signedIn.error, SIGN_IN_CANCELLED_MESSAGE);
  }

  if (purpose === 'privacy') {
    await assertPrivacyLockUnlocked();
    return;
  }
  await assertStepUpActive();
}
