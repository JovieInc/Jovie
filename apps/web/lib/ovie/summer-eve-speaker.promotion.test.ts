import { afterEach, describe, expect, it, vi } from 'vitest';
import { ovieSummerTurnId } from './summer-conversation';
import { createEveSummerSpeaker } from './summer-eve-speaker';
import { SUMMER_PRODUCTION } from './summer-production-identity';
import {
  resetSummerProductionPinCache,
  resolveSummerEveCallerOrigin,
} from './summer-production-pin';
import { CURRENT_SUMMER_SESSION_ID } from './summer-session';

const fetchShadow =
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const principalHash = 'a'.repeat(43);
const eventId = ovieSummerTurnId({
  conversationId: CURRENT_SUMMER_SESSION_ID,
  clientTurnId: 'client_1',
});

function identity(deploymentId: string): Response {
  return Response.json({
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId,
    blobAuth: 'oidc',
  });
}

function result(deploymentId: string) {
  return {
    eventId,
    conversationId: 'summer-session-current',
    principalHash,
    deploymentId,
    sessionId: 'ses_summer',
    turnId: 'turn_1',
    responseText: 'Hello Tim, Summer Jovi here.',
    status: 'completed',
    nextStartIndex: 7,
    model: 'zai/glm-5.3-flash',
  };
}

async function speak() {
  const events = [];
  for await (const event of createEveSummerSpeaker(fetchShadow).speak({
    clientTurnId: 'client_1',
    principalHash,
    userText: 'Hello Summer',
    history: [],
  })) {
    events.push(event);
  }
  return events;
}

function postCount(): number {
  return fetchShadow.mock.calls.filter(call => call[1]?.method === 'POST')
    .length;
}

describe('Summer promotion inside the pin TTL', () => {
  afterEach(() => {
    fetchShadow.mockReset();
    resetSummerProductionPinCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts verified deployment B without replaying the POST', async () => {
    let live = 'dpl_cachedA';
    const identityFetch = vi.fn<typeof fetch>(async () => identity(live));
    vi.stubGlobal('fetch', identityFetch);
    await resolveSummerEveCallerOrigin({ fetchImpl: identityFetch });
    expect(identityFetch).toHaveBeenCalledOnce();

    fetchShadow.mockImplementation(async (_path, init) => {
      if (init?.method === 'POST') {
        live = 'dpl_promotedB';
        return Response.json(
          { ok: true, accepted: { eventId } },
          {
            status: 202,
            headers: { 'x-jovie-eve-deployment-id': 'dpl_promotedB' },
          }
        );
      }
      return Response.json(
        { ok: true, result: result('dpl_promotedB') },
        { headers: { 'x-jovie-eve-deployment-id': 'dpl_promotedB' } }
      );
    });

    const events = await speak();
    expect(events).toContainEqual({
      type: 'text-delta',
      text: 'Hello Tim, Summer Jovi here.',
    });
    expect(postCount()).toBe(1);
    expect(identityFetch).toHaveBeenCalledTimes(2);
    expect(fetchShadow.mock.calls[1]?.[1]?.headers).toMatchObject({
      'x-jovie-summer-deployment-id': 'dpl_promotedB',
    });
  });

  it('rejects a deployment the refreshed identity does not serve', async () => {
    const identityFetch = vi.fn<typeof fetch>(async () =>
      identity('dpl_cachedA')
    );
    vi.stubGlobal('fetch', identityFetch);
    await resolveSummerEveCallerOrigin({ fetchImpl: identityFetch });
    fetchShadow.mockResolvedValueOnce(
      new Response('{}', {
        headers: { 'x-jovie-eve-deployment-id': 'dpl_foreign' },
      })
    );

    expect(await speak()).toEqual([{ type: 'error', state: 'unknown' }]);
    expect(postCount()).toBe(1);
    expect(fetchShadow).toHaveBeenCalledOnce();
    expect(identityFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects when the refreshed alias identity cannot be verified', async () => {
    let reads = 0;
    const identityFetch = vi.fn<typeof fetch>(async () => {
      reads += 1;
      if (reads === 1) return identity('dpl_cachedA');
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', identityFetch);
    await resolveSummerEveCallerOrigin({ fetchImpl: identityFetch });
    fetchShadow.mockResolvedValueOnce(
      new Response('{}', {
        headers: { 'x-jovie-eve-deployment-id': 'dpl_promotedB' },
      })
    );

    expect(await speak()).toEqual([{ type: 'error', state: 'unknown' }]);
    expect(postCount()).toBe(1);
    expect(fetchShadow).toHaveBeenCalledOnce();
    expect(identityFetch).toHaveBeenCalledTimes(2);
  });
});
