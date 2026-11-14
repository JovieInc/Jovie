import type { AgentRoomRoster } from '@jovie/agent-transport-contracts/agent-room';

/**
 * Ovie's fleet room: the company's own agents, on the shared agent-room
 * contract. The roster is source, not inference: an agent joins it here.
 * Speakers the Linear source sees that are not listed still show, marked as
 * not on the roster. See docs/operations/AGENT_ROOM.md.
 */
export const OVIE_FLEET_ROOM_ID = 'ovie:fleet';

/** Who the room's composer posts as: the founder's Linear account. */
export const OVIE_FLEET_SENDER_ID = 'tim';

const FLEET_THREAD = {
  ref: 'JOV-12296',
  url: 'https://linear.app/jovie/issue/JOV-12296',
} as const;
const CODEX_DOTS_THREAD = {
  ref: 'JOV-7998',
  url: 'https://linear.app/jovie/issue/JOV-7998',
} as const;

export const OVIE_FLEET_ROSTER: AgentRoomRoster = {
  roomId: OVIE_FLEET_ROOM_ID,
  title: 'Fleet room',
  agents: [
    {
      id: 'summer',
      name: 'Summer',
      kind: 'agent',
      role: 'Company governor',
      aliases: ['Summer'],
      homeThread: FLEET_THREAD,
    },
    {
      id: 'elsa',
      name: 'Elsa',
      kind: 'agent',
      role: 'Claude Duet, main chat',
      aliases: ['Elsa', 'Claude Duet', 'Duet', 'Claude Duet (Elsa)'],
      homeThread: FLEET_THREAD,
    },
    {
      id: 'chloe',
      name: 'Chloe',
      kind: 'agent',
      role: 'Codex agent',
      aliases: ['Chloe'],
      homeThread: CODEX_DOTS_THREAD,
    },
    {
      id: 'lola',
      name: 'Lola',
      kind: 'agent',
      role: 'Assistant, Codex',
      aliases: ['Lola'],
      homeThread: CODEX_DOTS_THREAD,
    },
    {
      id: 'codex',
      name: 'Codex',
      kind: 'agent',
      role: 'Linear agent app',
      aliases: ['Codex'],
      sourceUserIds: ['c802cb9b-dcdd-4081-afa9-376e905b73ab'],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      kind: 'agent',
      role: 'Linear agent app',
      aliases: ['Cursor'],
      sourceUserIds: ['3b62c653-d5b2-4f16-b14c-bd4856027816'],
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      kind: 'agent',
      role: 'Linear agent app',
      aliases: ['Copilot', 'GitHub Copilot'],
      sourceUserIds: ['67734339-bbdc-41e6-aa49-104b804d81e0'],
    },
    {
      id: 'tim',
      name: 'Tim',
      kind: 'human',
      role: 'Founder',
      aliases: ['Tim', 'Tim White'],
    },
  ],
};

/** Threads the backstop reads besides issues labelled `fleet`. */
export const OVIE_FLEET_HOME_THREADS: readonly string[] = [
  ...new Set(
    OVIE_FLEET_ROSTER.agents.flatMap(agent =>
      agent.homeThread ? [agent.homeThread.ref] : []
    )
  ),
].sort();
