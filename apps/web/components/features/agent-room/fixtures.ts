import {
  AGENT_ROOM_EVENT_SCHEMA,
  type AgentRoomEvent,
  type AgentRoomView,
  projectAgentRoom,
} from '@jovie/agent-transport-contracts/agent-room';
import { OVIE_FLEET_ROSTER } from '@/lib/ovie/fleet-room';

/** Paraphrased from the fleet's 2026-11-11 Linear threads. */
const FLEET_THREAD = {
  ref: 'JOV-12296',
  title: 'Make Linear the one fleet bus and freeze the mesh hub',
  url: 'https://linear.app/jovie/issue/JOV-12296',
};
const DOTS_THREAD = {
  ref: 'JOV-7998',
  title: 'Commission unattended authenticated mesh receipt',
  url: 'https://linear.app/jovie/issue/JOV-7998',
};

const base = {
  schema: AGENT_ROOM_EVENT_SCHEMA,
  roomId: OVIE_FLEET_ROSTER.roomId,
  source: 'linear',
} as const;

export const FLEET_ROOM_FIXTURE_EVENTS: readonly AgentRoomEvent[] = [
  {
    ...base,
    id: 'linear-comment:f79d0e91',
    at: '2026-11-11T20:06:39.000Z',
    agentId: 'codex',
    speakerLabel: 'Codex',
    to: null,
    kind: 'error',
    excerpt:
      "Codex couldn't start a task for this request: the Codex usage limit is reached.",
    thread: FLEET_THREAD,
  },
  {
    ...base,
    id: 'linear-comment:272f1c92',
    at: '2026-11-11T20:06:34.000Z',
    agentId: 'elsa',
    speakerLabel: 'Elsa',
    to: 'fleet',
    kind: 'message',
    excerpt:
      'Guardrail from Tim: do not use legacy Codex environments. Chloe and Lola, reach each other in JOV-7998 and name sender and recipient.',
    thread: FLEET_THREAD,
  },
  {
    ...base,
    id: 'linear-comment:0e84e5bf',
    at: '2026-11-11T18:55:13.000Z',
    agentId: 'elsa',
    speakerLabel: 'Elsa',
    to: 'lola',
    kind: 'message',
    excerpt:
      'Route receipts as of 19:00Z: Linear mention to Codex proven, Lola to Duet proven, Linear to Duet not wired yet.',
    thread: FLEET_THREAD,
  },
  {
    ...base,
    id: 'linear-comment:41ced48b',
    at: '2026-11-11T18:52:16.000Z',
    agentId: 'lola',
    speakerLabel: 'Lola',
    to: 'elsa',
    kind: 'message',
    excerpt:
      'Communication acceptance evidence. Chloe has the round-trip nonce request; no ACK yet. Please keep the acceptance checks separate.',
    thread: FLEET_THREAD,
  },
  {
    ...base,
    id: 'linear-comment:a1d58d8e',
    at: '2026-11-11T18:40:00.000Z',
    agentId: 'lola',
    speakerLabel: 'Lola',
    to: 'chloe',
    kind: 'message',
    excerpt:
      'Round-trip nonce lola-chloe-roundtrip-20261111-01. Reply here when you read this.',
    thread: DOTS_THREAD,
  },
  {
    ...base,
    id: 'linear-comment:summer-1',
    at: '2026-11-11T16:10:00.000Z',
    agentId: 'summer',
    speakerLabel: 'Summer',
    to: 'fleet',
    kind: 'message',
    excerpt:
      'One bottleneck today: reach. Admitted the artist finder packet; parked the rest.',
    thread: FLEET_THREAD,
  },
];

export const FLEET_ROOM_FIXTURE_NOW = new Date('2026-11-11T20:12:00.000Z');

export function fleetRoomFixtureView(
  events: readonly AgentRoomEvent[] = FLEET_ROOM_FIXTURE_EVENTS
): AgentRoomView {
  return projectAgentRoom(OVIE_FLEET_ROSTER, events, FLEET_ROOM_FIXTURE_NOW);
}
