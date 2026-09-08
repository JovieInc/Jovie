import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
  type OperatingStore,
} from '@/lib/ovie/mcp/store';
import { enqueueOvieSummerTurn } from '@/lib/ovie/summer-conversation';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  isAdmin: vi.fn(),
  store: undefined as OperatingStore | undefined,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: vi.fn(() => mocks.store),
}));

import { GET, POST } from './route';

function sessionRequest(body?: unknown): Request {
  return new Request('https://jov.ie/api/ovie/summer', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: '__session=packaged-electron-session',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/ovie/summer authenticated route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store = new DurableOperatingStore(memoryRecordBackend());
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'founder_1',
      email: 'founder@example.com',
    });
    mocks.isAdmin.mockResolvedValue(true);
  });

  it('uses the real session principal to claim and complete a Summer turn', async () => {
    const store = mocks.store as OperatingStore;
    await enqueueOvieSummerTurn(store, {
      id: 'turn_session_route',
      conversationId: 'summer-session:current',
      userText: 'Run the next shipping bottleneck cycle.',
    });

    const pending = await GET(sessionRequest());
    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toMatchObject({
      ok: true,
      turns: [{ id: 'turn_session_route' }],
    });
    expect(mocks.isAdmin).toHaveBeenCalledWith('founder_1');

    const claim = await POST(
      sessionRequest({
        action: 'claim',
        id: 'turn_session_route',
        worker_id: 'summer-mac',
      })
    );
    expect(claim.status).toBe(200);
    const claimBody = (await claim.json()) as {
      turn: { claim_token: string };
    };

    const completion = await POST(
      sessionRequest({
        action: 'complete',
        id: 'turn_session_route',
        claim_token: claimBody.turn.claim_token,
        response_text: 'Summer completed the authenticated route turn.',
      })
    );
    expect(completion.status).toBe(200);
    await expect(
      store.getSummerTurn('turn_session_route')
    ).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Summer completed the authenticated route turn.',
    });
  });
});
