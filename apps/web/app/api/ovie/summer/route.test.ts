import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
  type OperatingStore,
} from '@/lib/ovie/mcp/store';
import { enqueueOvieSummerTurn } from '@/lib/ovie/summer-conversation';

const mocks = vi.hoisted(() => ({
  principal: {
    authenticated: false,
    isAdmin: false,
    scopes: [] as string[],
  },
  store: undefined as OperatingStore | undefined,
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: vi.fn(async () => mocks.principal),
}));

vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: vi.fn(() => mocks.store),
}));

import { GET, POST } from './route';

function post(body: unknown): Request {
  return new Request('https://jov.ie/api/ovie/summer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/ovie/summer', () => {
  beforeEach(() => {
    mocks.store = new DurableOperatingStore(memoryRecordBackend());
    mocks.principal = {
      authenticated: false,
      isAdmin: false,
      scopes: [],
    };
  });

  it('rejects an unauthenticated pending poll and a read-only claim', async () => {
    expect(
      (await GET(new Request('https://jov.ie/api/ovie/summer'))).status
    ).toBe(401);

    mocks.principal = {
      authenticated: true,
      isAdmin: true,
      scopes: ['ovie:read'],
    };
    expect(
      (
        await POST(
          post({ action: 'claim', id: 'turn_1', worker_id: 'summer-mac' })
        )
      ).status
    ).toBe(403);
  });

  it('claims and durably completes through the founder-scoped route', async () => {
    mocks.principal = {
      authenticated: true,
      isAdmin: true,
      scopes: ['ovie:read', 'ovie:write'],
    };
    const store = mocks.store as OperatingStore;
    await enqueueOvieSummerTurn(store, {
      id: 'turn_route',
      conversationId: 'summer-session:current',
      userText: 'Continue through current Summer.',
    });

    const pending = await GET(new Request('https://jov.ie/api/ovie/summer'));
    expect(await pending.json()).toMatchObject({
      ok: true,
      turns: [{ id: 'turn_route' }],
    });

    const claim = await POST(
      post({
        action: 'claim',
        id: 'turn_route',
        worker_id: 'summer-mac',
      })
    );
    const claimBody = (await claim.json()) as {
      turn: { claim_token: string };
    };
    expect(claim.status).toBe(200);

    const completion = await POST(
      post({
        action: 'complete',
        id: 'turn_route',
        claim_token: claimBody.turn.claim_token,
        response_text: 'Current Summer completed the founder turn.',
      })
    );
    expect(completion.status).toBe(200);
    await expect(store.getSummerTurn('turn_route')).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Current Summer completed the founder turn.',
    });
  });

  it('fails a fenced claim and refuses a stale token', async () => {
    mocks.principal = {
      authenticated: true,
      isAdmin: true,
      scopes: ['ovie:read', 'ovie:write'],
    };
    const store = mocks.store as OperatingStore;
    await enqueueOvieSummerTurn(store, {
      id: 'turn_fail',
      conversationId: 'summer-session:current',
      userText: 'Fail this founder turn.',
    });

    const claim = await POST(
      post({
        action: 'claim',
        id: 'turn_fail',
        worker_id: 'summer-mac',
      })
    );
    const claimBody = (await claim.json()) as {
      turn: { claim_token: string };
    };
    expect(claim.status).toBe(200);

    expect(
      (
        await POST(
          post({
            action: 'fail',
            id: 'turn_fail',
            claim_token: 'stale-claim',
            failure_code: 'summer-runtime-exit-1',
          })
        )
      ).status
    ).toBe(409);

    const failed = await POST(
      post({
        action: 'fail',
        id: 'turn_fail',
        claim_token: claimBody.turn.claim_token,
        failure_code: 'summer-runtime-exit-1',
      })
    );
    expect(failed.status).toBe(200);
    await expect(store.getSummerTurn('turn_fail')).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'summer-runtime-exit-1',
    });
  });
});
