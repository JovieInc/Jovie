/**
 * Cloudflare x402-proxy PROTECTED_PATTERNS for Jovie artist resources (GitHub #12750).
 * Mirrors cloudflare/templates x402-proxy-template wrangler.jsonc shape.
 */

import {
  X402_SPIKE_DEMO_USERNAME,
  X402_SPIKE_TEST_ASSETS,
  type X402TestAsset,
} from './test-asset';

export interface X402ProtectedPattern {
  readonly pattern: string;
  readonly price: string;
  readonly description: string;
  readonly bot_score_threshold?: number;
  readonly except_detection_ids?: readonly number[];
}

/** Known Bot Management detection IDs from Cloudflare x402-proxy template comments. */
export const X402_KNOWN_BOT_DETECTION_IDS = {
  googlebot: 120_623_194,
  bingbot: 117_479_730,
  chatgptUser: 132_995_013,
  claudeUser: 33_564_303,
} as const;

export function assetToProtectedPattern(
  asset: X402TestAsset
): X402ProtectedPattern {
  return {
    pattern: asset.proxyProtectedPattern,
    price: asset.suggestedPriceUsd,
    description: asset.description,
  };
}

export function buildJovieProtectedPatterns(): readonly X402ProtectedPattern[] {
  return X402_SPIKE_TEST_ASSETS.map(assetToProtectedPattern);
}

/**
 * Bot-filtered variant: humans pass free; verified crawlers/agents in except list
 * also pass; unverified bots must pay. Requires Bot Management Enterprise.
 */
export function buildBotFilteredMcpPattern(): X402ProtectedPattern {
  return {
    pattern: `/api/mcp/${X402_SPIKE_DEMO_USERNAME}/*`,
    price: '$0.01',
    description: 'Paid MCP access for unverified agents (1h JWT cookie)',
    bot_score_threshold: 30,
    except_detection_ids: [
      X402_KNOWN_BOT_DETECTION_IDS.googlebot,
      X402_KNOWN_BOT_DETECTION_IDS.bingbot,
      X402_KNOWN_BOT_DETECTION_IDS.chatgptUser,
      X402_KNOWN_BOT_DETECTION_IDS.claudeUser,
    ],
  };
}

export function buildWranglerVarsSnippet(): {
  readonly PROTECTED_PATTERNS: readonly X402ProtectedPattern[];
  readonly ORIGIN_URL: string;
  readonly NETWORK: string;
  readonly FACILITATOR_URL: string;
} {
  return {
    PROTECTED_PATTERNS: buildJovieProtectedPatterns(),
    ORIGIN_URL: 'https://staging.jov.ie',
    NETWORK: 'base-sepolia',
    FACILITATOR_URL: 'https://x402.org/facilitator',
  };
}
