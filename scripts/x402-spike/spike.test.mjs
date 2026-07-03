import { describe, expect, it } from 'vitest';
import {
  assertPinnedSpikeAssets,
  loadSpikeTestAssetJson,
} from './validate-test-asset.ts';

describe('x402 spike test asset fixture (#12750)', () => {
  it('loads and validates pinned MCP + press-kit assets', () => {
    const fixture = loadSpikeTestAssetJson();
    expect(fixture.issue).toBe('JovieInc/Jovie#12750');
    expect(fixture.assets).toHaveLength(2);
    assertPinnedSpikeAssets(fixture);
  });

  it('pins lunawaves as demo MCP username', () => {
    const fixture = loadSpikeTestAssetJson();
    expect(fixture.demoUsername).toBe('lunawaves');
    const mcp = fixture.assets.find(a => a.kind === 'mcp-artist');
    expect(mcp?.originPath).toBe('/api/mcp/lunawaves');
  });

  it('includes MCP smoke JSON-RPC request for agent client replay', () => {
    const fixture = loadSpikeTestAssetJson();
    const mcp = fixture.assets.find(a => a.kind === 'mcp-artist');
    expect(mcp?.mcpSmokeRequest?.method).toBe('resources/list');
    expect(mcp?.mcpSmokeRequest?.jsonrpc).toBe('2.0');
  });
});
