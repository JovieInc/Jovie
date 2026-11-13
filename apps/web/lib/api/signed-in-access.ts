import 'server-only';

import { requireAuth } from '@/lib/auth/require-auth';
import type { AccessPolicy, RouteHandlerInput } from './route-pipeline';

export interface SignedInAuth {
  readonly userId: string;
}

/** First argument of a handler behind `signedInAccess()`. */
export type SignedInRouteInput<TBody = undefined> = RouteHandlerInput<
  SignedInAuth,
  TBody
>;

/** Any signed-in user (401 otherwise), with the same body `requireAuth` sends. */
export function signedInAccess(): AccessPolicy<SignedInAuth> {
  return {
    name: 'signed-in',
    async authorize() {
      const { userId, error } = await requireAuth();
      if (error) {
        return { ok: false, status: error.status, body: await error.json() };
      }
      return { ok: true, auth: { userId } };
    },
  };
}
