import type {
  AgentRoomAgentView,
  AgentRoomRosterEntry,
} from '@jovie/agent-transport-contracts/agent-room';
import { OVIE_FLEET_ROSTER } from '@/lib/ovie/fleet-room';

/** Fleet onboarding status until live gates are wired. */
export type FleetAgentStatus = 'live' | 'degraded' | 'draft';

/** Stub readiness gates (agent-onboarding vision); probes land in a later slice. */
export const FLEET_READINESS_GATE_STUBS = [
  'Gbrain',
  'Company context',
  'Ovie / Summer mesh',
  'Registry',
  'Secrets',
  'Usage ledger',
] as const;

export type FleetReadinessGateStub =
  (typeof FLEET_READINESS_GATE_STUBS)[number];

export interface FleetAgentTableRow {
  readonly id: string;
  readonly fleetId: string;
  readonly role: string;
  readonly kind: AgentRoomRosterEntry['kind'];
  readonly defaultDisplayName: string;
  readonly status: FleetAgentStatus;
  readonly readinessSummary: string;
  readonly readinessGaps: readonly FleetReadinessGateStub[];
  readonly presence?: AgentRoomAgentView['presence'];
}

function stubStatus(kind: AgentRoomRosterEntry['kind']): FleetAgentStatus {
  if (kind === 'human') return 'live';
  return 'degraded';
}

function stubGaps(
  kind: AgentRoomRosterEntry['kind']
): readonly FleetReadinessGateStub[] {
  if (kind === 'human') return [];
  return FLEET_READINESS_GATE_STUBS.slice(0, 3);
}

function readinessSummary(status: FleetAgentStatus, gapCount: number): string {
  if (status === 'live' && gapCount === 0) return 'Ready';
  if (gapCount === 0) return 'Gates pending';
  return `${gapCount} gap${gapCount === 1 ? '' : 's'}`;
}

/** Table rows from the canonical roster until Neon-backed profiles exist. */
export function fleetAgentRowsFromRoster(
  roster = OVIE_FLEET_ROSTER,
  presenceById: ReadonlyMap<string, AgentRoomAgentView['presence']> = new Map()
): FleetAgentTableRow[] {
  return roster.agents.map(entry => {
    const status = stubStatus(entry.kind);
    const readinessGaps = stubGaps(entry.kind);
    return {
      id: entry.id,
      fleetId: entry.id,
      role: entry.role,
      kind: entry.kind,
      defaultDisplayName: entry.name,
      status,
      readinessSummary: readinessSummary(status, readinessGaps.length),
      readinessGaps,
      presence: presenceById.get(entry.id),
    };
  });
}

export function fleetAgentPresenceMap(
  agents: readonly AgentRoomAgentView[]
): Map<string, AgentRoomAgentView['presence']> {
  return new Map(agents.map(agent => [agent.id, agent.presence]));
}
