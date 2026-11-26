import type { FounderSummerAuthorization } from './summer-founder-auth';

/**
 * What an operator sees when the founder Summer gate refuses a turn. `error`
 * stays the legacy wire string; `message` is the plain sentence the chat
 * surfaces show; `errorCode` is the same on web and mobile.
 */
export const FOUNDER_SUMMER_DENIAL = {
  unconfigured: {
    status: 503,
    errorCode: 'SUMMER_FOUNDER_IDENTITY_UNCONFIGURED',
    error: 'Founder Summer identity is not configured',
    message: "Summer isn't connected on this environment yet.",
  },
  forbidden: {
    status: 403,
    errorCode: 'SUMMER_FOUNDER_ACCESS_REQUIRED',
    error: 'Founder Summer access required',
    message: "This account isn't Summer's founder account.",
  },
} as const satisfies Record<
  Exclude<FounderSummerAuthorization, 'authorized'>,
  { status: number; errorCode: string; error: string; message: string }
>;
