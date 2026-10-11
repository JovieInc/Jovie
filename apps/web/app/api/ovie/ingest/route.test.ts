import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  memoryRecordBackend,
  type OperatingStore,
} from '@/lib/ovie/mcp/store';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  principal: vi.fn(),
  store: undefined as OperatingStore | undefined,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));

vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: vi.fn(() => mocks.store),
}));

import { GET as readPending } from '../pending/route';
import { POST } from './route';

function captureRequest(text: string): Request {
  return new Request('https://jov.ie/api/ovie/ingest', {
    method: 'POST',
    headers: {
      cookie: '__session=packaged-electron-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ items: [text] }),
  });
}

describe('POST /api/ovie/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store = new DurableOperatingStore(memoryRecordBackend());
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    mocks.principal.mockResolvedValue({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });
  });

  it('recovers a local receipt after 401 through the shared founder session and durable readback', async () => {
    const localReceipt = 'Keep the registry evidence attached to this review.';

    const unauthorized = await POST(captureRequest(localReceipt));
    expect(unauthorized.status).toBe(401);
    await expect(mocks.store?.listInitiatives()).resolves.toEqual([]);

    mocks.principal.mockResolvedValue({
      authenticated: true,
      isAdmin: true,
      subject: 'founder_1',
      email: 'founder@example.com',
      scopes: ['ovie:read', 'ovie:write'],
    });

    const delivered = await POST(captureRequest(localReceipt));
    expect(delivered.status).toBe(200);
    const firstBody = (await delivered.json()) as {
      receipts: Array<{ workId: string; text: string }>;
    };
    expect(firstBody.receipts).toHaveLength(1);
    expect(firstBody.receipts[0]?.text).toBe(localReceipt);

    const retry = await POST(captureRequest(localReceipt));
    const retryBody = (await retry.json()) as {
      receipts: Array<{ workId: string }>;
    };
    expect(retry.status).toBe(200);
    expect(retryBody.receipts[0]?.workId).toBe(firstBody.receipts[0]?.workId);

    const readback = await readPending(
      new Request('https://jov.ie/api/ovie/pending', {
        headers: { cookie: '__session=packaged-electron-session' },
      })
    );
    expect(readback.status).toBe(200);
    await expect(readback.json()).resolves.toMatchObject({
      ok: true,
      initiatives: [
        {
          id: firstBody.receipts[0]?.workId,
          handoff: { intent: localReceipt },
        },
      ],
    });
    await expect(mocks.store?.listInitiatives()).resolves.toHaveLength(1);
    expect(mocks.principal).toHaveBeenCalledTimes(4);
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it('keeps founder session failures private', async () => {
    mocks.principal.mockRejectedValue(
      new Error('private Better Auth backend diagnostic')
    );

    const response = await POST(captureRequest('Keep this local.'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ ok: false });
  });
});
