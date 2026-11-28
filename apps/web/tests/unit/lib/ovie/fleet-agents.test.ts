import { describe, expect, it } from 'vitest';
import {
  FLEET_READINESS_GATE_STUBS,
  fleetAgentRowsFromRoster,
} from '@/lib/ovie/fleet-agents';
import { OVIE_FLEET_ROSTER } from '@/lib/ovie/fleet-room';

describe('fleetAgentRowsFromRoster', () => {
  it('maps the canonical roster to table rows with stub readiness', () => {
    const rows = fleetAgentRowsFromRoster();
    expect(rows).toHaveLength(OVIE_FLEET_ROSTER.agents.length);
    const tim = rows.find(row => row.id === 'tim');
    expect(tim?.status).toBe('live');
    expect(tim?.readinessGaps).toEqual([]);
    const summer = rows.find(row => row.id === 'summer');
    expect(summer?.status).toBe('degraded');
    expect(summer?.readinessGaps.length).toBeGreaterThan(0);
    expect(FLEET_READINESS_GATE_STUBS.length).toBe(6);
  });

  it('merges room presence when provided', () => {
    const rows = fleetAgentRowsFromRoster(
      OVIE_FLEET_ROSTER,
      new Map([['summer', 'active']])
    );
    expect(rows.find(row => row.id === 'summer')?.presence).toBe('active');
  });
});
