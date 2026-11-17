import type { ProductFlagKey } from './registry';

/** Auth and access switches do not announce customer-facing capabilities. */
export const PUBLIC_ACCESS_FLAG_CAPABILITIES = {
  OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION: {
    nonMarketing: 'OAuth dynamic client registration kill switch',
  },
  SPOTIFY_OAUTH: { nonMarketing: 'account connection plumbing' },
  PUBLIC_SIGNUP_CLOSED: {
    nonMarketing: 'closed signup kill switch; default off',
  },
} as const satisfies Readonly<
  Partial<Record<ProductFlagKey, { readonly nonMarketing: string }>>
>;
