import {
  AGENT_ROOM_EVENT_SCHEMA,
  AGENT_ROOM_EXCERPT_CHARS,
  AGENT_ROOM_VIEW_EVENTS,
  type AgentRoomEvent,
  type AgentRoomRoster,
  classifyMessageKind,
  decodeAgentRoomEvent,
  discoveredAgentId,
  parseSpeakerPrefix,
  projectAgentRoom,
  resolveRosterAgent,
  roomExcerpt,
} from '@jovie/agent-transport-contracts/agent-room';
import { describe, expect, it } from 'vitest';

const roster: AgentRoomRoster = {
  roomId: 'test:room',
  title: 'Test room',
  agents: [
    {
      id: 'summer',
      name: 'Summer',
      kind: 'agent',
      role: 'Governor',
      aliases: [],
    },
    {
      id: 'elsa',
      name: 'Elsa',
      kind: 'agent',
      role: 'Main chat',
      aliases: ['Claude Duet'],
    },
    { id: 'lola', name: 'Lola', kind: 'agent', role: 'Assistant', aliases: [] },
  ],
};

const NOW = new Date('2026-11-11T20:00:00.000Z');

function event(
  overrides: Partial<AgentRoomEvent> &
    Pick<AgentRoomEvent, 'id' | 'agentId' | 'at'>
): AgentRoomEvent {
  return {
    schema: AGENT_ROOM_EVENT_SCHEMA,
    roomId: 'test:room',
    source: 'linear',
    speakerLabel: overrides.agentId,
    to: null,
    kind: 'message',
    excerpt: 'hello',
    thread: { ref: 'JOV-1', title: 'Thread', url: null },
    ...overrides,
  };
}

describe('agent room contract', () => {
  it('parses the fleet [From → To] speaker prefix', () => {
    expect(parseSpeakerPrefix('[Lola → Claude Duet] Route receipts')).toEqual({
      from: 'Lola',
      to: 'Claude Duet',
      rest: 'Route receipts',
    });
    expect(
      parseSpeakerPrefix('[Claude Duet (Elsa) -> fleet] Guardrail')
    ).toMatchObject({
      from: 'Claude Duet (Elsa)',
      to: 'fleet',
    });
    expect(parseSpeakerPrefix('Validation lifecycle moved JOV-1')).toBeNull();
    expect(parseSpeakerPrefix('See [the docs](https://x) → there')).toBeNull();
  });

  it('resolves names, parenthesised aliases and unknown speakers deterministically', () => {
    expect(resolveRosterAgent(roster, 'claude duet')?.id).toBe('elsa');
    expect(resolveRosterAgent(roster, 'Claude Duet (Elsa)')?.id).toBe('elsa');
    expect(resolveRosterAgent(roster, 'Gem')).toBeNull();
    expect(discoveredAgentId('Gem Lanes!')).toBe('x-gem-lanes');
  });

  it('classifies provider failures and cleans excerpts', () => {
    expect(
      classifyMessageKind(
        "Codex couldn't start a task for this request: You have reached your Codex usage limits."
      )
    ).toBe('error');
    expect(classifyMessageKind('All checks green')).toBe('message');
    expect(
      roomExcerpt(
        '**Bold** `code` text\n<!-- receipt:v1 {"a":1} -->\n| a | b |\n|---|---|'
      )
    ).toBe('Bold code text a b');
    const long = roomExcerpt('word '.repeat(200));
    expect(long.length).toBeLessThanOrEqual(AGENT_ROOM_EXCERPT_CHARS + 1);
    expect(long.endsWith('…')).toBe(true);
  });

  it('projects presence, order and counts from events and the clock only', () => {
    const events = [
      event({ id: 'a', agentId: 'summer', at: '2026-11-11T19:50:00.000Z' }),
      event({ id: 'b', agentId: 'lola', at: '2026-11-11T10:00:00.000Z' }),
      event({
        id: 'c',
        agentId: 'x-gem',
        speakerLabel: 'Gem',
        at: '2026-11-11T19:55:00.000Z',
        to: 'summer',
      }),
      event({
        id: 'd',
        agentId: 'lola',
        at: '2026-11-11T19:59:00.000Z',
        kind: 'error',
        excerpt: 'usage limits',
      }),
      event({
        id: 'other-room',
        agentId: 'elsa',
        at: '2026-11-11T19:59:00.000Z',
        roomId: 'test:other',
      }),
    ];
    const view = projectAgentRoom(roster, events, NOW);
    expect(view.agents.map(agent => [agent.id, agent.presence])).toEqual([
      ['lola', 'blocked'],
      ['summer', 'active'],
      ['x-gem', 'active'],
      ['elsa', 'unseen'],
    ]);
    expect(view.agents.find(agent => agent.id === 'x-gem')).toMatchObject({
      name: 'Gem',
      onRoster: false,
    });
    expect(view.events.map(e => e.id)).toEqual(['d', 'c', 'a', 'b']);
    expect(view.events[1]).toMatchObject({
      agentName: 'Gem',
      toName: 'Summer',
    });
    expect(view.counts).toEqual({ active: 2, blocked: 1, events24h: 4 });
    // Same inputs in another order give the same view.
    expect(projectAgentRoom(roster, [...events].reverse(), NOW)).toEqual(view);
  });

  it('bounds the rendered feed and reads quiet agents as quiet', () => {
    const many = Array.from({ length: AGENT_ROOM_VIEW_EVENTS + 20 }, (_, i) =>
      event({
        id: `e${String(i).padStart(3, '0')}`,
        agentId: 'summer',
        at: new Date(
          Date.parse('2026-11-01T00:00:00.000Z') + i * 60_000
        ).toISOString(),
      })
    );
    const view = projectAgentRoom(roster, many, NOW);
    expect(view.events).toHaveLength(AGENT_ROOM_VIEW_EVENTS);
    expect(view.agents.find(agent => agent.id === 'summer')?.presence).toBe(
      'quiet'
    );
  });

  it('decodes stored events strictly', () => {
    const stored = event({
      id: 'a',
      agentId: 'summer',
      at: '2026-11-11T19:50:00.000Z',
    });
    expect(decodeAgentRoomEvent(JSON.stringify(stored))).toEqual(stored);
    expect(decodeAgentRoomEvent(stored)).toEqual(stored);
    expect(decodeAgentRoomEvent('{not json')).toBeNull();
    expect(decodeAgentRoomEvent({ ...stored, schema: 'other' })).toBeNull();
  });
});
