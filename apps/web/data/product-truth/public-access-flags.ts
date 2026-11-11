import type { ProductFlagKey } from './registry';

/** Auth and access switches do not announce customer-facing capabilities. */
export const PUBLIC_ACCESS_FLAG_CAPABILITIES = {
  OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION: {
    nonMarketing: 'OAuth dynamic client registration kill switch',
  },
  SPOTIFY_OAUTH: { nonMarketing: 'account connection plumbing' },
  ONE_FLOW_ONBOARDING: {
    nonMarketing: 'one-flow onboarding gate kill switch; default on',
  },
  PUBLIC_SIGNUP_CLOSED: { nonMarketing: 'closed signup gate; default on' },
} as const satisfies Readonly<
  Partial<Record<ProductFlagKey, { readonly nonMarketing: string }>>
>;
