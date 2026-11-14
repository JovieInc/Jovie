import {
  AGENT_ROOM_EVENT_SCHEMA,
  AGENT_ROOM_MAX_EVENTS,
  type AgentRoomEvent,
} from '@jovie/agent-transport-contracts/agent-room';
import { describe, expect, it, vi } from 'vitest';
import {
  agentRoomKey,
  readAgentRoomEvents,
  writeAgentRoomEvents,
} from './store.server';
import { memoryRoomRedis } from './test-redis';

vi.mock('server-only', () => ({}));

function event(
  id: string,
  minute: number,
  roomId = 'ovie:fleet'
): AgentRoomEvent {
  return {
    schema: AGENT_ROOM_EVENT_SCHEMA,
    id,
    roomId,
    source: 'linear',
    at: new Date(
      Date.parse('2026-11-01T00:00:00.000Z') + minute * 60_000
    ).toISOString(),
    agentId: 'summer',
    speakerLabel: 'Summer',
    to: null,
    kind: 'message',
    excerpt: `message ${id}`,
    thread: { ref: 'JOV-1', title: null, url: null },
  };
}

describe('agent room store', () => {
  it('upserts by source id so replays never duplicate', async () => {
    const redis = memoryRoomRedis();
    await writeAgentRoomEvents(redis, 'ovie:fleet', [event('a', 1)]);
    await writeAgentRoomEvents(redis, 'ovie:fleet', [
      { ...event('a', 1), excerpt: 'edited' },
      event('b', 2),
    ]);
    const events = await readAgentRoomEvents(redis, 'ovie:fleet');
    expect(events.map(e => [e.id, e.excerpt])).toEqual([
      ['b', 'message b'],
      ['a', 'edited'],
    ]);
  });

  it('refuses events for another room or that fail the schema', async () => {
    const redis = memoryRoomRedis();
    const receipt = await writeAgentRoomEvents(redis, 'ovie:fleet', [
      event('a', 1, 'other:room'),
      { ...event('b', 2), at: 'not a date' },
    ]);
    expect(receipt).toEqual({ written: 0, trimmed: 0 });
    expect(redis.hashes.size).toBe(0);
  });

  it('trims to the newest events once over the cap', async () => {
    const redis = memoryRoomRedis();
    const events = Array.from({ length: AGENT_ROOM_MAX_EVENTS + 60 }, (_, i) =>
      event(`e${i}`, i)
    );
    const receipt = await writeAgentRoomEvents(redis, 'ovie:fleet', events);
    expect(receipt.trimmed).toBe(60);
    expect(redis.hashes.get(agentRoomKey('ovie:fleet'))?.size).toBe(
      AGENT_ROOM_MAX_EVENTS
    );
    expect(redis.hashes.get(agentRoomKey('ovie:fleet'))?.has('e0')).toBe(false);
  });
});
