import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  list: vi.fn(),
  resolvePrincipal: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.resolvePrincipal,
}));
vi.mock('@/lib/ovie/dogfood-roster.server', () => ({
  listDogfooders: mocks.list,
  upsertDogfooder: mocks.upsert,
}));

const { GET, POST } = await import('./route');
const admin = { authenticated: true, isAdmin: true, scopes: [] };
const dogfooder = {
  actorKey: 'human:internal-1',
  actorKind: 'internal_human',
  displayName: 'Internal One',
  products: ['jov', 'lyb'],
  consent: {
    grantedAt: null,
    scope: [],
    source: null,
    revokedAt: null,
  },
  signalState: 'invited',
};
const privateHandle = 'private@example.test';
const url = 'https://jov.ie/api/ovie/dogfooders';
const post = (body: unknown) =>
  POST(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

describe('/api/ovie/dogfooders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePrincipal.mockResolvedValue(admin);
    mocks.list.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ id: 'dogfooder-1', ...dogfooder });
  });

  it('returns 403 without reading or leaking handles to a non-admin', async () => {
    mocks.resolvePrincipal.mockResolvedValue({ ...admin, isAdmin: false });
    const response = await GET(
      new Request(url, {
        headers: {
          'x-agent-id': 'self-asserted-agent',
          'x-user-email': 'self-asserted@example.test',
        },
      })
    );
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(privateHandle);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('lists and upserts private roster data for a Summer admin', async () => {
    mocks.list.mockResolvedValue([
      { id: 'dogfooder-1', handle: privateHandle },
    ]);
    const listed = await GET(new Request(url));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      dogfooders: [{ handle: privateHandle }],
    });
    const saved = await post(dogfooder);
    expect(saved.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
});
