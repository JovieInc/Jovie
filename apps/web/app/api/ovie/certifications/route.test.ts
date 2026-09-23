import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import {
  type CertificationRecordBackend,
  MarketingCertificationStore,
} from '@/lib/agent-os/certification-adapter';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  store: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: mocks.store,
}));

const request = () => new Request('https://jov.ie/api/ovie/certifications');

describe('Ovie marketing certification inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  });

  it('rejects unauthenticated and non-admin callers before opening the store', async () => {
    mocks.principal.mockResolvedValueOnce({
      authenticated: false,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(401);
    mocks.principal.mockResolvedValueOnce({
      authenticated: true,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('returns the exact marketing registry projection without ledger writes or raw records', async () => {
    const backend: CertificationRecordBackend = {
      async get() {
        return null;
      },
      async compareAndSet() {
        throw new Error('inventory attempted a write');
      },
      async setIfAbsent() {
        throw new Error('inventory attempted a write');
      },
    };
    mocks.store.mockReturnValue(
      new MarketingCertificationStore(backend, MARKETING_COMPONENT_REGISTRY)
    );

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body.scope).toEqual({
      domain: 'marketing_components',
      universal: false,
    });
    expect(body.registryIds).toEqual(
      MARKETING_COMPONENT_REGISTRY.map(entry => entry.id)
    );
    expect(body.rows).toHaveLength(MARKETING_COMPONENT_REGISTRY.length);
    expect(body.rows[0]).toMatchObject({
      identityId: MARKETING_COMPONENT_REGISTRY[0]?.id,
      state: 'working',
      reviewReady: false,
    });
    expect(JSON.stringify(body)).not.toContain('auditHistory');
    expect(JSON.stringify(body)).not.toContain('decisions');
  });

  it('fails closed when principal lookup or persisted projection fails', async () => {
    mocks.principal.mockRejectedValueOnce(
      new Error('role service unavailable')
    );
    expect((await GET(request())).status).toBe(503);
    expect(mocks.store).not.toHaveBeenCalled();

    mocks.store.mockReturnValue({
      inspectLedger: vi.fn().mockRejectedValue(new Error('registry drift')),
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'certification_inventory_unavailable',
    });
  });
});
