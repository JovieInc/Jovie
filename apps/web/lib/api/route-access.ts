import 'server-only';

import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';
import type { AccessPolicy, RouteHandlerInput } from './route-pipeline';

export type OperatorEntitlements = Awaited<
  ReturnType<typeof getOvieOperatorEntitlements>
>;

/** First argument of a handler behind `operatorAccess()`. */
export type OperatorRouteInput<TBody = undefined> = RouteHandlerInput<
  OperatorEntitlements,
  TBody
>;

/**
 * Admin operator gate: signed in (401 otherwise), admin with the Ovie privacy
 * lock open (403 otherwise). `purpose: 'read'` is the audited observation mode
 * that tolerates stale MFA; mutations pass `session: 'fresh'`.
 *
 * Replaces the copy-pasted `getOvieOperatorEntitlements` + two `if` blocks.
 */
export function operatorAccess(
  options?: Parameters<typeof getOvieOperatorEntitlements>[0]
): AccessPolicy<OperatorEntitlements> {
  return {
    name: 'operator',
    async authorize() {
      // No options means no argument, exactly as the routes called it.
      const entitlements = options
        ? await getOvieOperatorEntitlements(options)
        : await getOvieOperatorEntitlements();
      if (!entitlements.isAuthenticated) {
        return { ok: false, status: 401, body: { error: 'Unauthorized' } };
      }
      if (!entitlements.isAdmin) {
        return { ok: false, status: 403, body: { error: 'Forbidden' } };
      }
      return { ok: true, auth: entitlements };
    },
  };
}
