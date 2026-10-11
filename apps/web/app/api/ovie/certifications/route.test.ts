import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import {
  type CertificationRecordBackend,
  MarketingCertificationStore,
} from '@/lib/agent-os/certification-adapter';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import type { CertificationPacketFileRead } from '@/lib/ovie/certifications/packet-files.server';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  store: vi.fn(),
  backend: vi.fn(),
  packetFiles: vi.fn(),
  featureRegistry: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: mocks.store,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: mocks.backend,
}));
vi.mock(
  '@/lib/ovie/certifications/packet-files.server',
  async importActual => ({
    ...(await importActual<
      typeof import('@/lib/ovie/certifications/packet-files.server')
    >()),
    readCertificationPacketFiles: mocks.packetFiles,
  })
);
vi.mock('@/lib/admin/feature-registry-source', () => ({
  readFeatureRegistrySource: mocks.featureRegistry,
}));

const request = () => new Request('https://jov.ie/api/ovie/certifications');

const readOnlyBackend: CertificationRecordBackend = {
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

const packetRead: CertificationPacketFileRead = {
  root: '/repo/docs/certification',
  files: [
    {
      domain: 'flows',
      surface: 'Golden Path',
      packetUpdatedAt: '2026-09-27T07:00:00.000Z',
      links: [],
      packet: fixturePacket('signup'),
      file: 'docs/certification/2026-09-27/signup.packet.json',
    },
  ],
  issues: [],
};

describe('GET /api/ovie/certifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
    mocks.store.mockReturnValue(
      new MarketingCertificationStore(
        readOnlyBackend,
        MARKETING_COMPONENT_REGISTRY
      )
    );
    mocks.backend.mockReturnValue(readOnlyBackend);
    mocks.packetFiles.mockResolvedValue(packetRead);
    mocks.featureRegistry.mockResolvedValue({
      items: [],
      sourceUpdatedAt: '2026-09-27T07:00:00.000Z',
    });
  });

  it('rejects unauthenticated and non-admin callers before reading any inventory', async () => {
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
    expect(mocks.packetFiles).not.toHaveBeenCalled();
  });

  it('returns the unified contract across domains without writes or raw kernel records', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();

    expect(body).toMatchObject({
      contract: 'jovie.ovie-certification-inventory/v1',
      universal: false,
    });
    expect(body.counts.total).toBe(MARKETING_COMPONENT_REGISTRY.length + 1);
    expect(body.queue.contract).toBe('jovie.certification-inbox/v1');
    expect(
      body.queue.needsYou.map(
        (item: { subject: { id: string } }) => item.subject.id
      )
    ).toEqual(['signup']);
    expect(body.queue.blocked).toHaveLength(
      MARKETING_COMPONENT_REGISTRY.length
    );
    expect(body.rows[0]).toMatchObject({
      id: 'flows:signup',
      domain: 'flows',
      surface: 'Golden Path',
      state: 'review_ready',
      decision: { available: true },
    });
    expect(Object.keys(body.rows[0]).sort()).toEqual(
      [
        'blockers',
        'decision',
        'domain',
        'evidence',
        'history',
        'id',
        'links',
        'source',
        'staleFounderLock',
        'state',
        'subject',
        'surface',
        'tiers',
        'updatedAt',
      ].sort()
    );
    const marketing = body.rows.filter(
      (row: { domain: string }) => row.domain === 'marketing_components'
    );
    expect(
      marketing.map((row: { subject: { id: string } }) => row.subject.id).sort()
    ).toEqual(MARKETING_COMPONENT_REGISTRY.map(entry => entry.id).sort());
    expect(
      body.domains.find(
        (domain: { domain: string }) => domain.domain === 'acquisition'
      )
    ).toMatchObject({ status: 'not_connected', rowCount: 0 });
    expect(
      body.domains.find(
        (domain: { domain: string }) => domain.domain === 'customers'
      )
    ).toMatchObject({ status: 'not_connected', rowCount: 0 });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('canonicalReferences');
    expect(serialized).not.toContain('auditHistory');
  });

  it('keeps serving other domains when one domain store fails', async () => {
    mocks.store.mockReturnValue({
      inspectLedger: vi.fn().mockRejectedValue(new Error('registry drift')),
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows.map((row: { id: string }) => row.id)).toEqual([
      'flows:signup',
    ]);
    expect(
      body.domains.find(
        (domain: { domain: string }) => domain.domain === 'marketing_components'
      )
    ).toMatchObject({ status: 'error' });
  });

  it('fails closed when principal lookup or the inventory read throws', async () => {
    mocks.principal.mockRejectedValueOnce(
      new Error('role service unavailable')
    );
    expect((await GET(request())).status).toBe(503);
    expect(mocks.store).not.toHaveBeenCalled();

    mocks.packetFiles.mockRejectedValueOnce(new Error('fs exploded'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'certification_inventory_unavailable',
    });
  });

  it('reads recorded decisions from the persisted ledger', async () => {
    const backend = memoryCertificationBackend();
    backend.records.set(
      'jovie:certification:v1:packet-decisions:flows',
      JSON.stringify({
        schemaVersion: 1,
        contract: 'jovie.certification/v1',
        domain: 'flows',
        records: {},
      })
    );
    mocks.backend.mockReturnValue(backend);
    const body = await (await GET(request())).json();
    expect(
      body.domains.find((d: { domain: string }) => d.domain === 'flows')
    ).toMatchObject({ status: 'connected', rowCount: 1 });
  });
});
