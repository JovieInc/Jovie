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
 * Passkey add/remove is allowed with a live step-up on this session, or
 * for the very first passkey when the sign-in is at most 10 minutes old.
 */
export function passkeyChangeAllowed(input: {
  readonly hasLiveStepUp: boolean;
  readonly existingPasskeys: number;
  readonly sessionAgeMs: number;
}): boolean {
  if (input.hasLiveStepUp) return true;
  return (
    input.existingPasskeys === 0 &&
    input.sessionAgeMs >= 0 &&
    input.sessionAgeMs <= PASSKEY_ENROLLMENT_MAX_SESSION_AGE_MS
  );
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
                hasLiveStepUp: Boolean(
                  receipt && new Date(receipt.expiresAt).getTime() > Date.now()
                ),
                existingPasskeys: existing,
                sessionAgeMs:
                  Date.now() - new Date(current.session.createdAt).getTime(),
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
            await context.context.internalAdapter.createVerificationValue({
              identifier: adminStepUpIdentifier(session.id),
              value: new Date().toISOString(),
              expiresAt: new Date(Date.now() + ADMIN_STEP_UP_TTL_MS),
            });
          }),
        },
      ],
    },
  };
}
