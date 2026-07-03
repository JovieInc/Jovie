/**
 * Pinned test asset for the x402 payment-gated artist resources spike (GitHub #12750).
 *
 * Primary surface: per-artist MCP endpoint (JovieInc/Jovie#11034).
 * Secondary surface: library press-kit share drops (`/drop/[token]`).
 */

export const X402_SPIKE_ISSUE = 'JovieInc/Jovie#12750' as const;

export type X402TestAssetKind = 'mcp-artist' | 'press-kit-drop';

export interface X402TestAsset {
  readonly kind: X402TestAssetKind;
  readonly label: string;
  readonly originPathPattern: string;
  readonly proxyProtectedPattern: string;
  readonly suggestedPriceUsd: string;
  readonly description: string;
  readonly mcpMethods?: readonly string[];
}

/** Demo artist used across eval fixtures — stable public MCP target. */
export const X402_SPIKE_DEMO_USERNAME = 'lunawaves' as const;

export const X402_SPIKE_TEST_ASSETS: readonly X402TestAsset[] = [
  {
    kind: 'mcp-artist',
    label: 'Per-artist MCP server',
    originPathPattern: `/api/mcp/${X402_SPIKE_DEMO_USERNAME}`,
    proxyProtectedPattern: `/api/mcp/${X402_SPIKE_DEMO_USERNAME}/*`,
    suggestedPriceUsd: '$0.01',
    description: 'MCP resources/read + tools/call for one public artist',
    mcpMethods: ['resources/read', 'tools/call'],
  },
  {
    kind: 'press-kit-drop',
    label: 'Library press-kit share drop',
    originPathPattern: '/drop/*',
    proxyProtectedPattern: '/drop/*',
    suggestedPriceUsd: '$0.05',
    description: 'Branded press-kit asset bundle (library_share_drops)',
  },
] as const;

export const X402_SPIKE_PRIMARY_ASSET = X402_SPIKE_TEST_ASSETS[0];

export function getTestAssetByKind(
  kind: X402TestAssetKind
): X402TestAsset | undefined {
  return X402_SPIKE_TEST_ASSETS.find((asset) => asset.kind === kind);
}