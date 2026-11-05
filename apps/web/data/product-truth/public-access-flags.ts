import type { ProductFlagKey } from './registry';

/** Auth-entry and access switches do not announce customer-facing capabilities. */
export const PUBLIC_ACCESS_FLAG_CAPABILITIES = {
  OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION: {
    nonMarketing: 'OAuth dynamic client registration kill switch',
  },
  AUTH_OFFER_SUMMARY: {
    nonMarketing:
      'auth offer recap; default off; no price, trial, or entitlement change',
  },
  PUBLIC_SIGNUP_CLOSED: { nonMarketing: 'closed signup gate; default on' },
} as const satisfies Readonly<
  Partial<Record<ProductFlagKey, { readonly nonMarketing: string }>>
>;
