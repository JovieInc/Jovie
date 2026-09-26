/**
 * Whether a Vercel AI Gateway call can authenticate.
 *
 * A static `AI_GATEWAY_API_KEY` covers local development and CI. On Vercel,
 * OIDC is injected at request time and `@ai-sdk/gateway` uses it when the
 * static key is unset. Do not read the OIDC token in this check.
 */
export function isAiGatewayAvailable(input: {
  readonly apiKey: string | undefined;
  readonly vercel?: string | undefined;
}): boolean {
  const vercel = input.vercel ?? process.env.VERCEL;
  return Boolean(input.apiKey?.trim()) || vercel === '1';
}
