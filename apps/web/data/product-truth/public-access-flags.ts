import type { ProductFlagKey } from './registry';

/** Access-control switches do not announce customer-facing capabilities. */
export const PUBLIC_ACCESS_FLAG_CAPABILITIES = {
  OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION: {
    nonMarketing: 'OAuth dynamic client registration kill switch',
  },
  CHATGPT_APP_DIRECTORY_MCP: {
    nonMarketing:
      'ChatGPT directory MCP kill switch; anonymous public artist reads; default off',
  },
  PUBLIC_SIGNUP_CLOSED: { nonMarketing: 'closed signup gate; default on' },
} as const satisfies Readonly<
  Partial<Record<ProductFlagKey, { readonly nonMarketing: string }>>
>;
