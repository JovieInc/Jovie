import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProfileCapabilitiesFromRegistry,
  renderArtistProfileInventory,
} from '@/lib/ovie/mcp/artist-profile-inventory';

describe('Public Artist Profile inventory', () => {
  it('parses Profile rows from FEATURE_REGISTRY.md', () => {
    const markdown = readFileSync(
      resolve(process.cwd(), '../../docs/FEATURE_REGISTRY.md'),
      'utf8'
    );
    const caps = parseProfileCapabilitiesFromRegistry(markdown);
    expect(caps.length).toBeGreaterThan(3);
    expect(caps.some(cap => cap.feature.includes('Public profile'))).toBe(true);
    expect(caps.some(cap => cap.feature.includes('Auto-sync'))).toBe(true);
    expect(caps.some(cap => /merch/i.test(cap.feature))).toBe(true);
    expect(caps.every(cap => cap.certLevel !== 'certified')).toBe(true);
    expect(
      caps.find(cap => cap.feature.includes('Auto-sync'))?.proposedMission
    ).toMatch(/canonical artist identity/i);
    const report = renderArtistProfileInventory(caps);
    expect(report).toContain('Recommended certification order');
    expect(report).toContain('must-sell');
  });
});
