import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  X402_SPIKE_ISSUE,
  X402_SPIKE_TEST_ASSETS,
} from '../../apps/web/lib/x402-spike/test-asset';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SpikeTestAssetJson {
  readonly issue: string;
  readonly demoUsername: string;
  readonly primaryAsset: string;
  readonly originBaseUrl: string;
  readonly network: string;
  readonly facilitatorUrl: string;
  readonly assets: readonly {
    readonly kind: string;
    readonly label: string;
    readonly originPath: string;
    readonly protectedPattern: string;
    readonly suggestedPriceUsd: string;
    readonly mcpSmokeRequest?: Record<string, unknown>;
  }[];
  readonly liveE2eBlockers: readonly string[];
}

export function loadSpikeTestAssetJson(): SpikeTestAssetJson {
  const raw = readFileSync(join(__dirname, 'test-asset.json'), 'utf8');
  return JSON.parse(raw) as SpikeTestAssetJson;
}

export function assertPinnedSpikeAssets(fixture: SpikeTestAssetJson): void {
  if (fixture.issue !== X402_SPIKE_ISSUE) {
    throw new Error(`Expected issue ${X402_SPIKE_ISSUE}, got ${fixture.issue}`);
  }
  if (fixture.assets.length < 2) {
    throw new Error('Spike fixture must define MCP + press-kit assets');
  }
  const mcp = fixture.assets.find((a) => a.kind === 'mcp-artist');
  if (!mcp?.mcpSmokeRequest) {
    throw new Error('MCP asset must include mcpSmokeRequest for agent client smoke');
  }
  if (fixture.primaryAsset !== 'mcp-artist') {
    throw new Error('Primary spike asset must be mcp-artist per issue scope');
  }
  for (const libAsset of X402_SPIKE_TEST_ASSETS) {
    const match = fixture.assets.find((a) => a.kind === libAsset.kind);
    if (!match) {
      throw new Error(`Fixture missing lib asset kind: ${libAsset.kind}`);
    }
    if (match.protectedPattern !== libAsset.proxyProtectedPattern) {
      throw new Error(
        `Pattern drift for ${libAsset.kind}: ${match.protectedPattern} vs ${libAsset.proxyProtectedPattern}`
      );
    }
  }
}