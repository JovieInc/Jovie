import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/ovie/operational-truth/route';
import { shippingProjection } from '@/tests/fixtures/ovie-operational-truth';

const mocks = vi.hoisted(() => ({
  authorizeHud: vi.fn(),
  env: { HERMES_HUD_API_KEY: 'publisher-secret' as string | undefined },
  insert: vi.fn(),
  values: vi.fn(),
  onConflict: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/auth/hud', () => ({ authorizeHud: mocks.authorizeHud }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/db', () => ({
  db: { insert: mocks.insert, select: mocks.select },
}));
const candidate = () =>
  shippingProjection({ freshUntil: '2099-08-22T03:00:05.000Z' });
function request(method: 'GET' | 'POST', body?: unknown, token?: string) {
  return new NextRequest('http://localhost/api/ovie/operational-truth', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}
describe('/api/ovie/operational-truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.HERMES_HUD_API_KEY = 'publisher-secret';
    mocks.authorizeHud.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflict });
    mocks.onConflict.mockReturnValue({ returning: mocks.returning });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);
  });
  it('keeps customer reads and unconfigured publisher writes closed', async () => {
    expect((await GET(request('GET'))).status).toBe(401);
    mocks.env.HERMES_HUD_API_KEY = undefined;
    expect((await POST(request('POST', candidate()))).status).toBe(503);
  });
  it('rejects bad publisher credentials and non-contract payloads', async () => {
    expect((await POST(request('POST', candidate(), 'wrong'))).status).toBe(
      401
    );
    expect((await POST(request('POST', {}, 'publisher-secret'))).status).toBe(
      400
    );
  });
  it('uses an atomic conditional upsert and returns an accepted receipt', async () => {
    const projection = candidate();
    mocks.returning.mockResolvedValue([{ value: projection }]);
    const response = await POST(
      request('POST', projection, 'publisher-secret')
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: 'accepted',
      projectionId: projection.projectionId,
      sequence: 1,
    });
    expect(mocks.onConflict).toHaveBeenCalledWith(
      expect.objectContaining({ setWhere: expect.anything() })
    );
  });
  it('distinguishes an identical retry from a conflicting replay', async () => {
    const projection = candidate();
    mocks.returning.mockResolvedValue([]);
    mocks.limit.mockResolvedValue([{ value: projection }]);
    expect(
      (await POST(request('POST', projection, 'publisher-secret'))).status
    ).toBe(200);
    const divergent = structuredClone(projection);
    divergent.sources[0].facts.implementing = 1;
    mocks.limit.mockResolvedValue([{ value: divergent }]);
    expect(
      (await POST(request('POST', projection, 'publisher-secret'))).status
    ).toBe(409);
  });
  it('allows the existing HUD admin boundary to read durable truth', async () => {
    const projection = candidate();
    mocks.authorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    mocks.limit.mockResolvedValue([{ value: projection }]);
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'fresh',
      reason: 'current',
      projection: { projectionId: projection.projectionId },
    });
  });
});
