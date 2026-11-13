import 'server-only';

import {
  AGENT_ROOM_MAX_EVENTS,
  type AgentRoomEvent,
  agentRoomEventSchema,
  compareRoomEvents,
  decodeAgentRoomEvent,
} from '@jovie/agent-transport-contracts/agent-room';

/**
 * The room store: one Redis hash per room, field = event id, value = the
 * event JSON. Writes are upserts by stable source id, so a replayed webhook or
 * a backstop sync never duplicates a row. Reads are one HGETALL and never call
 * a provider. The hash is trimmed to the newest AGENT_ROOM_MAX_EVENTS.
 */
export interface AgentRoomRedis {
  hset(key: string, fields: Record<string, string>): Promise<unknown>;
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
  hlen(key: string): Promise<number>;
}

const KEY_PREFIX = 'agent-room:v1';
/** Trim only once the room is this far over the cap, to keep writes cheap. */
const TRIM_SLACK = 50;

export const agentRoomKey = (roomId: string) => `${KEY_PREFIX}:${roomId}`;

export async function readAgentRoomEvents(
  redis: AgentRoomRedis,
  roomId: string
): Promise<AgentRoomEvent[]> {
  const hash = await redis.hgetall<Record<string, unknown>>(
    agentRoomKey(roomId)
  );
  const events: AgentRoomEvent[] = [];
  for (const value of Object.values(hash ?? {})) {
    const event = decodeAgentRoomEvent(value);
    if (event && event.roomId === roomId) events.push(event);
  }
  return events.sort(compareRoomEvents);
}

export interface AgentRoomWriteReceipt {
  readonly written: number;
  readonly trimmed: number;
}

export async function writeAgentRoomEvents(
  redis: AgentRoomRedis,
  roomId: string,
  input: readonly AgentRoomEvent[]
): Promise<AgentRoomWriteReceipt> {
  const fields: Record<string, string> = {};
  for (const event of input) {
    const parsed = agentRoomEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.roomId !== roomId) continue;
    fields[parsed.data.id] = JSON.stringify(parsed.data);
  }
  const written = Object.keys(fields).length;
  if (written === 0) return { written: 0, trimmed: 0 };
  const key = agentRoomKey(roomId);
  await redis.hset(key, fields);

  const size = await redis.hlen(key);
  if (size <= AGENT_ROOM_MAX_EVENTS + TRIM_SLACK)
    return { written, trimmed: 0 };
  const events = await readAgentRoomEvents(redis, roomId);
  const stale = events.slice(AGENT_ROOM_MAX_EVENTS).map(event => event.id);
  if (stale.length) await redis.hdel(key, ...stale);
  return { written, trimmed: stale.length };
}
