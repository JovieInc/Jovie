/** First-party OAuth clients. Their redirects are not MCP callbacks. */
export const OAUTH_PROVIDER_TRUSTED_CLIENT_IDS = new Set([
  'logyourbody-ios',
  'logyourbody-web',
]);

export function isOAuthProviderTrustedClient(clientId: string): boolean {
  return OAUTH_PROVIDER_TRUSTED_CLIENT_IDS.has(clientId);
}
