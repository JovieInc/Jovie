/**
 * Screenshot player timestamp uniqueness invariant (JOV-2087)
 *
 * Enforces that no two marketing screenshot scenarios with a visible audio
 * player declare the same `playerTimestamp`. Duplicate timestamps make
 * screenshots look copy-pasted rather than authentic.
 *
 * How this works:
 * - Scenarios with a visible player set `playerTimestamp` in the registry
 * - This test asserts those timestamps are unique across all scenarios
 * - Adding a new player screenshot without a timestamp is allowed (no player shown)
 * - Adding a timestamp that duplicates an existing one fails this test
 */

import { describe, expect, it } from 'vitest';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';

describe('screenshot player timestamp invariants (JOV-2087)', () => {
  it('has no duplicate playerTimestamp values across scenarios', () => {
    const scenariosWithTimestamp = SCREENSHOT_SCENARIOS.filter(
      scenario => scenario.playerTimestamp !== undefined
    );

    const timestamps = scenariosWithTimestamp.map(
      scenario => scenario.playerTimestamp as string
    );
    const uniqueTimestamps = new Set(timestamps);

    if (uniqueTimestamps.size !== timestamps.length) {
      // Find duplicates for a helpful error message
      const seen = new Map<string, string>();
      const duplicates: Array<{ timestamp: string; ids: string[] }> = [];

      for (const scenario of scenariosWithTimestamp) {
        const ts = scenario.playerTimestamp as string;
        if (seen.has(ts)) {
          duplicates.push({ timestamp: ts, ids: [seen.get(ts)!, scenario.id] });
        } else {
          seen.set(ts, scenario.id);
        }
      }

      throw new Error(
        `Duplicate playerTimestamp values detected:\n${duplicates
          .map(d => `  "${d.timestamp}" used by: ${d.ids.join(', ')}`)
          .join(
            '\n'
          )}\n\nEach scenario with a visible player must declare a unique timestamp.`
      );
    }

    expect(uniqueTimestamps.size).toBe(timestamps.length);
  });

  it('uses valid timestamp format for declared playerTimestamps', () => {
    // Format: M:SS or MM:SS (e.g. "1:24", "12:07")
    const TIMESTAMP_PATTERN = /^\d{1,2}:\d{2}$/;

    const scenariosWithTimestamp = SCREENSHOT_SCENARIOS.filter(
      scenario => scenario.playerTimestamp !== undefined
    );

    for (const scenario of scenariosWithTimestamp) {
      expect(
        TIMESTAMP_PATTERN.test(scenario.playerTimestamp as string),
        `Scenario "${scenario.id}" has invalid playerTimestamp format: "${scenario.playerTimestamp}". Expected M:SS or MM:SS.`
      ).toBe(true);
    }
  });

  it('has at least some scenarios with playerTimestamp declared', () => {
    // Sanity check: we expect some scenarios to have timestamps declared
    // so the above uniqueness test is actually exercised
    const scenariosWithTimestamp = SCREENSHOT_SCENARIOS.filter(
      scenario => scenario.playerTimestamp !== undefined
    );

    expect(
      scenariosWithTimestamp.length,
      'Expected at least one scenario with a playerTimestamp — add playerTimestamp to scenarios that show a visible audio player'
    ).toBeGreaterThan(0);
  });

  it('keeps Tim White profile mobile variants with player as the canonical player timestamp source', () => {
    // The Tim White profile listen/pay/live/subscribe modes show a player
    const playerModes = ['listen', 'pay', 'live', 'subscribe'];

    for (const mode of playerModes) {
      const scenario = SCREENSHOT_SCENARIOS.find(
        s => s.id === `tim-white-profile-${mode}-mobile`
      );

      expect(
        scenario,
        `tim-white-profile-${mode}-mobile scenario not found`
      ).toBeDefined();

      expect(
        scenario?.playerTimestamp,
        `tim-white-profile-${mode}-mobile should have a unique playerTimestamp since it shows an audio player`
      ).toBeDefined();
    }
  });
});
