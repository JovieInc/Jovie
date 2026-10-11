import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import {
  ADMIN_STEP_UP_TTL_MS,
  adminStepUpIdentifier,
  PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS,
} from '@/lib/admin/mfa';

const VERIFY_AUTHENTICATION_PATH = '/passkey/verify-authentication';
const VERIFY_REGISTRATION_PATH = '/passkey/verify-registration';
const REGISTER_PATHS = new Set([
  '/passkey/generate-register-options',
  VERIFY_REGISTRATION_PATH,
]);
// Long enough to outlive any credential; revocation deletes the passkey row.
const DEVICE_PASSKEY_MARKER_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Marks a credential that was added on a fresh sign-in while the account
 * already had a passkey (founder decision 2026-09-26): a device passkey,
 * such as Touch ID in the Mac app. It signs the user in on that device but
 * is not an admin factor, so phishing a normal sign-in cannot mint one.
 */
export function devicePasskeyIdentifier(credentialId: string): string {
  return `device-passkey:${credentialId}`;
}

function readCredentialId(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const response = (body as { response?: unknown }).response;
  if (response === null || typeof response !== 'object') return null;
  const id = (response as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function isFailedResult(returned: unknown): boolean {
  return (
    returned instanceof Error ||
    returned instanceof Response ||
    (returned !== null &&
      typeof returned === 'object' &&
      'status' in returned &&
      typeof (returned as { status?: unknown }).status === 'string')
  );
}

function hasLiveReceipt(
  receipt: { readonly expiresAt: Date | string } | null | undefined
): boolean {
  return Boolean(receipt && new Date(receipt.expiresAt).getTime() > Date.now());
}

/**
 * Passkey management that can mint or remove an admin factor. A stolen,
 * long-lived cookie must not be able to enroll its own passkey or delete
 * the founder's: the first enrollment needs a recent sign-in, and every
 * later change needs a live passkey step-up on the same session.
 */
const GUARDED_PATHS = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
]);

/**
 * Passkey changes are allowed with a live step-up on this session. Without
 * one, a sign-in at most 10 minutes old may add a passkey (the first one
 * becomes the admin factor; later ones are device passkeys, see
 * `devicePasskeyIdentifier`), and may remove or rename only when none exist.
 */
export function passkeyChangeAllowed(input: {
  readonly hasLiveStepUp: boolean;
  readonly existingPasskeys: number;
  readonly sessionAgeMs: number;
  readonly change?: 'register' | 'modify';
}): boolean {
  if (input.hasLiveStepUp) return true;
  const fresh =
    input.sessionAgeMs >= 0 &&
    input.sessionAgeMs <= PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS;
  if (!fresh) return false;
  return input.change === 'register' || input.existingPasskeys === 0;
}

/**
 * JOV-4806: a passkey authentication is the admin second factor. Better
 * Auth's passkey sign-in mints a new session; this plugin records a
 * 12-hour step-up receipt for that exact session in `ba_verifications`,
 * which `hasRecentAdminMfaReverification` reads.
 */
export function adminPasskeyStepUp(): BetterAuthPlugin {
  return {
    id: 'jovie-admin-passkey-step-up',
    hooks: {
      before: [
        {
          matcher: context => GUARDED_PATHS.has(context.path ?? ''),
          handler: createAuthMiddleware(async context => {
            const current = await getSessionFromCtx(context);
            if (!current) throw new APIError('UNAUTHORIZED');

            const receipt =
              await context.context.internalAdapter.findVerificationValue(
                adminStepUpIdentifier(current.session.id)
              );
            const existing = await context.context.adapter.count({
              model: 'passkey',
              where: [{ field: 'userId', value: current.user.id }],
            });
            if (
              passkeyChangeAllowed({
                hasLiveStepUp: hasLiveReceipt(receipt),
                existingPasskeys: existing,
                sessionAgeMs:
                  Date.now() - new Date(current.session.createdAt).getTime(),
                change: REGISTER_PATHS.has(context.path ?? '')
                  ? 'register'
                  : 'modify',
              })
            )
              return;

            throw new APIError('FORBIDDEN', {
              message:
                existing === 0
                  ? 'Sign in again to set up a passkey.'
                  : 'Unlock with your passkey first.',
              code: 'PASSKEY_STEP_UP_REQUIRED',
            });
          }),
        },
      ],
      after: [
        {
          matcher: context => context.path === VERIFY_AUTHENTICATION_PATH,
          handler: createAuthMiddleware(async context => {
            const session = context.context.newSession?.session;
            if (!session) return;
            const credentialId = readCredentialId(context.body);
            if (credentialId) {
              const deviceOnly =
                await context.context.internalAdapter.findVerificationValue(
                  devicePasskeyIdentifier(credentialId)
                );
              // A device passkey signs in but never unlocks admin data.
              if (deviceOnly) return;
            }
            await context.context.internalAdapter.createVerificationValue({
              identifier: adminStepUpIdentifier(session.id),
              value: new Date().toISOString(),
              expiresAt: new Date(Date.now() + ADMIN_STEP_UP_TTL_MS),
            });
          }),
        },
        {
          matcher: context => context.path === VERIFY_REGISTRATION_PATH,
          handler: createAuthMiddleware(async context => {
            if (isFailedResult(context.context.returned)) return;
            const credentialId = readCredentialId(context.body);
            const current = await getSessionFromCtx(context);
            if (!credentialId || !current) return;

            const receipt =
              await context.context.internalAdapter.findVerificationValue(
                adminStepUpIdentifier(current.session.id)
              );
            // Added under a live admin step-up: an admin factor like before.
            if (hasLiveReceipt(receipt)) return;
            const total = await context.context.adapter.count({
              model: 'passkey',
              where: [{ field: 'userId', value: current.user.id }],
            });
            // The account's first passkey keeps its admin-factor role.
            if (total <= 1) return;

            await context.context.internalAdapter.createVerificationValue({
              identifier: devicePasskeyIdentifier(credentialId),
              value: current.user.id,
              expiresAt: new Date(Date.now() + DEVICE_PASSKEY_MARKER_TTL_MS),
            });
          }),
        },
      ],
    },
  };
}
