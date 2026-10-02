import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { isAllowedMcpRedirectUri } from '@/lib/oauth/mcp-redirect-allowlist';

/**
 * Better Auth dynamic client registration.
 * Default off. Override with FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION=true.
 * Read at Better Auth startup; Better Auth discovery reads it per request.
 * The founder Ovie issuer advertises /api/ovie/oauth/register independently.
 */
export const OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION_FLAG =
  'OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION' as const;

/** Shared with the oauth-provider patch in patches/@better-auth__oauth-provider@1.7.6.patch. */
export const MCP_REDIRECT_ALLOWLIST_SYMBOL = Symbol.for(
  'jovie.mcp.isAllowedRedirectUri'
);

type AllowMcpRedirect = (uri: string) => boolean;

/**
 * Installs the shared MCP redirect allowlist where the patched Better Auth
 * redirect validator can see it. Unlisted URIs keep stock validation.
 */
export function installMcpRedirectAllowlistBridge(): void {
  const target = globalThis as typeof globalThis & {
    [key: symbol]: AllowMcpRedirect | undefined;
  };
  target[MCP_REDIRECT_ALLOWLIST_SYMBOL] = isAllowedMcpRedirectUri;
}

installMcpRedirectAllowlistBridge();

export function isOvieMcpDynamicClientRegistrationEnabled(): boolean {
  return isCodeFlagEnabled(OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION_FLAG);
}

/**
 * Both switches move together. MCP clients register without a session, and
 * registration stays closed unless the flag is on.
 */
export function mcpDynamicClientRegistrationOptions(
  enabled = isOvieMcpDynamicClientRegistrationEnabled()
): {
  readonly allowDynamicClientRegistration: boolean;
  readonly allowUnauthenticatedClientRegistration: boolean;
} {
  return {
    allowDynamicClientRegistration: enabled,
    allowUnauthenticatedClientRegistration: enabled,
  };
}
