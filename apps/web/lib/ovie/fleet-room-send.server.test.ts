import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { memoryRoomRedis } = await import('@/lib/agent-room/test-redis');
const { readAgentRoomEvents } = await import('@/lib/agent-room/store.server');
const { OVIE_FLEET_ROOM_ID } = await import('@/lib/ovie/fleet-room');
const { fleetRoomCanSend, fleetRoomMessageBody, sendFleetRoomMessage } =
  await import('./fleet-room-send.server');

function fakeLinear() {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const linear = async <T>(
    query: string,
    variables: Record<string, unknown>
  ) => {
    calls.push({ query, variables });
    if (query.includes('FleetRoomThread')) {
      return {
        issue: {
          id: 'issue-uuid',
          identifier: String(variables.ref),
          title: 'Codex dots thread',
          url: `https://linear.app/jovie/issue/${String(variables.ref)}`,
        },
      } as T;
    }
    return {
      commentCreate: {
        success: true,
        comment: { id: 'c-new', createdAt: '2026-11-11T21:00:00.000Z' },
      },
    } as T;
  };
  return { linear, calls };
}

describe('sendFleetRoomMessage', () => {
  it("posts a prefixed comment on the agent's home thread and shows it at once", async () => {
    const redis = memoryRoomRedis();
    const { linear, calls } = fakeLinear();
    const result = await sendFleetRoomMessage(
      { agentId: 'chloe', text: '  ACK the nonce when you read this  ' },
      { redis, linear }
    );
    expect(result).toEqual({
      status: 'sent',
      eventId: 'linear-comment:c-new',
      thread: 'JOV-7998',
    });
    expect(calls[0]?.variables).toEqual({ ref: 'JOV-7998' });
    expect(calls[1]?.variables).toEqual({
      issueId: 'issue-uuid',
      body: '[Tim → Chloe] ACK the nonce when you read this',
    });
    expect(String(calls[1]?.variables.body)).not.toContain('@');
    const events = await readAgentRoomEvents(redis, OVIE_FLEET_ROOM_ID);
    expect(events.map(event => [event.agentId, event.to])).toEqual([
      ['tim', 'chloe'],
    ]);
  });

  it('refuses humans, unknown agents, empty and oversized text without calling Linear', async () => {
    const { linear, calls } = fakeLinear();
    const deps = { redis: memoryRoomRedis(), linear };
    for (const [agentId, text, reason] of [
      ['tim', 'hi', 'unknown-agent'],
      ['nobody', 'hi', 'unknown-agent'],
      ['elsa', '   ', 'empty'],
      ['elsa', 'x'.repeat(2_001), 'too-long'],
    ] as const) {
      expect(await sendFleetRoomMessage({ agentId, text }, deps)).toEqual({
        status: 'rejected',
        reason,
      });
    }
    expect(calls).toHaveLength(0);
  });

  it('says so when Linear is not configured or does not take the comment', async () => {
    expect(
      await sendFleetRoomMessage(
        { agentId: 'elsa', text: 'hi' },
        { redis: null, linear: null }
      )
    ).toEqual({ status: 'unavailable', reason: 'linear-unconfigured' });
    const refused = async <T>(query: string) =>
      (query.includes('FleetRoomThread')
        ? {
            issue: { id: 'i', identifier: 'JOV-12296', title: null, url: null },
          }
        : { commentCreate: { success: false, comment: null } }) as T;
    expect(
      await sendFleetRoomMessage(
        { agentId: 'elsa', text: 'hi' },
        { redis: null, linear: refused }
      )
    ).toEqual({ status: 'unavailable', reason: 'post-failed' });
  });

  it('uses the fleet-bus prefix', () => {
    expect(fleetRoomMessageBody('Summer', 'status?')).toBe(
      '[Tim → Summer] status?'
    );
  });
});

describe('fleetRoomCanSend', () => {
  it('is true only with a Linear client', () => {
    expect(fleetRoomCanSend({ linear: null })).toBe(false);
    expect(fleetRoomCanSend({ linear: fakeLinear().linear })).toBe(true);
    // The configured default reads env; the mocked env has no Linear key.
    expect(fleetRoomCanSend()).toBe(false);
  });
});
