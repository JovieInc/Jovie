import { describe, expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import { buildCertificationDecisionDigest } from '@/lib/agent-os/certification';
import { MarketingCertificationStore } from '@/lib/agent-os/certification-adapter';
import {
  FIXTURE_NOW,
  fixturePacket,
  fixtureReceipt,
  memoryCertificationBackend,
} from './fixtures';
import {
  MARKETING_ASSURANCE_GATE,
  type OvieCertificationInventoryDeps,
  parseOvieCertificationDecisionRequest,
  readOvieCertificationInventory,
  recordOvieCertificationDecision,
} from './inventory.server';
import type { CertificationPacketFile } from './packet-files.server';

vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: vi.fn(),
}));

function packetFile(
  subjectId: string,
  overrides: Partial<CertificationPacketFile> = {}
): CertificationPacketFile {
  return {
    domain: 'flows',
    surface: 'Golden Path',
    packetUpdatedAt: '2026-09-27T07:00:00.000Z',
    links: [{ label: 'Run', href: 'https://ci.test/1', kind: 'test_run' }],
    packet: fixturePacket(subjectId),
    file: `docs/certification/${subjectId}.packet.json`,
    ...overrides,
  };
}

function deps(
  files: readonly CertificationPacketFile[],
  backend = memoryCertificationBackend()
): OvieCertificationInventoryDeps & {
  readonly backendInstance: ReturnType<typeof memoryCertificationBackend>;
} {
  const marketingBackend = memoryCertificationBackend();
  return {
    backendInstance: backend,
    backend: () => backend,
    marketingStore: () =>
      new MarketingCertificationStore(
        marketingBackend,
        MARKETING_COMPONENT_REGISTRY
      ),
    readPacketFiles: async () => ({
      root: '/repo/docs/certification',
      files,
      issues: [
        {
          domain: null,
          source: 'docs/certification/bad.packet.json',
          message: 'Invalid JSON.',
        },
      ],
    }),
  };
}

describe('readOvieCertificationInventory', () => {
  it('composes marketing and packet domains with an honest denominator', async () => {
    const inventory = await readOvieCertificationInventory(
      deps([
        packetFile('signup'),
        packetFile('lyb-onboarding', {
          domain: 'lyb',
          surface: 'Onboarding',
          packet: fixturePacket('lyb-onboarding', {
            visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
          }),
        }),
      ]),
      FIXTURE_NOW
    );

    expect(inventory).toMatchObject({
      contract: 'jovie.ovie-certification-inventory/v1',
      generatedAt: FIXTURE_NOW,
      universal: false,
    });
    const statusByDomain = Object.fromEntries(
      inventory.domains.map(domain => [domain.domain, domain.status])
    );
    expect(statusByDomain).toEqual({
      marketing_components: 'connected',
      flows: 'connected',
      public_profiles: 'empty',
      smart_links: 'empty',
      marketing: 'empty',
      lyb: 'connected',
      acquisition: 'not_connected',
    });
    expect(inventory.counts.total).toBe(
      MARKETING_COMPONENT_REGISTRY.length + 2
    );
    expect(inventory.counts.review_ready).toBe(1);
    expect(inventory.queue.contract).toBe('jovie.certification-inbox/v1');
    expect(inventory.queue.needsYou.map(item => item.subject.id)).toEqual([
      'signup',
    ]);
    expect(inventory.queue.blocked).toHaveLength(
      MARKETING_COMPONENT_REGISTRY.length + 1
    );
    // Review-ready work leads the table.
    expect(inventory.rows[0]).toMatchObject({
      id: 'flows:signup',
      state: 'review_ready',
      decision: { available: true },
    });
    const marketingRow = inventory.rows.find(
      row => row.domain === 'marketing_components'
    );
    expect(marketingRow?.decision.available).toBe(false);
    expect(inventory.issues).toContainEqual({
      domain: null,
      source: 'docs/certification/bad.packet.json',
      message: 'Invalid JSON.',
    });
  });

  it('reports a failed marketing ledger read as an error domain, not zero rows', async () => {
    const base = deps([packetFile('signup')]);
    const inventory = await readOvieCertificationInventory(
      {
        ...base,
        marketingStore: () =>
          ({
            inspectLedger: async () => {
              throw new Error('db down');
            },
          }) as unknown as MarketingCertificationStore,
      },
      FIXTURE_NOW
    );
    expect(
      inventory.domains.find(d => d.domain === 'marketing_components')
    ).toMatchObject({ status: 'error', rowCount: 0 });
    expect(inventory.rows.map(row => row.id)).toEqual(['flows:signup']);
  });

  it('fails a packet domain closed when its decision ledger cannot be read', async () => {
    const backend = memoryCertificationBackend();
    backend.records.set(
      'jovie:certification:v1:packet-decisions:flows',
      '{corrupt'
    );
    const inventory = await readOvieCertificationInventory(
      deps([packetFile('signup')], backend),
      FIXTURE_NOW
    );
    expect(inventory.domains.find(d => d.domain === 'flows')).toMatchObject({
      status: 'error',
      rowCount: 0,
    });
    expect(inventory.rows.some(row => row.domain === 'flows')).toBe(false);
    expect(inventory.issues).toContainEqual(
      expect.objectContaining({ domain: 'flows', source: 'ovie_operating_kv' })
    );
  });
});

describe('parseOvieCertificationDecisionRequest', () => {
  const valid = {
    rowId: 'flows:signup',
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    decision: 'approved',
    actionId: 'action-0001',
    notes: '  looks great ',
  };

  it('accepts a well-formed request and trims notes', () => {
    expect(parseOvieCertificationDecisionRequest(valid)).toEqual({
      ...valid,
      notes: 'looks great',
    });
  });

  it.each([
    ['non-object', null],
    ['missing domain separator', { ...valid, rowId: 'signup' }],
    ['bad digest', { ...valid, evidenceDigest: 'xyz' }],
    ['unknown decision', { ...valid, decision: 'maybe' }],
    ['short action id', { ...valid, actionId: 'a' }],
    [
      'request changes without a note',
      { ...valid, decision: 'changes_requested', notes: '   ' },
    ],
  ])('rejects %s', (_label, body) => {
    expect(parseOvieCertificationDecisionRequest(body)).toBeNull();
  });
});

describe('recordOvieCertificationDecision', () => {
  const file = packetFile('signup');
  const digest = buildCertificationDecisionDigest(file.packet);
  const request = {
    rowId: 'flows:signup',
    evidenceDigest: digest,
    decision: 'approved' as const,
    notes: null,
    actionId: 'action-0001',
  };

  it('records a founder approval and returns the refreshed row', async () => {
    const d = deps([file]);
    const outcome = await recordOvieCertificationDecision(
      request,
      'founder@example.test',
      d,
      '2026-09-27T08:00:00.000Z'
    );
    expect(outcome).toMatchObject({
      ok: true,
      row: {
        id: 'flows:signup',
        state: 'founder_locked',
        decision: { available: false },
      },
    });
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.row.history[0]).toMatchObject({
      kind: 'decision',
      actor: 'founder@example.test',
    });
  });

  it('returns 409 for stale evidence and duplicate actions', async () => {
    const d = deps([file]);
    await expect(
      recordOvieCertificationDecision(
        { ...request, evidenceDigest: `sha256:${'b'.repeat(64)}` },
        'founder',
        d,
        '2026-09-27T08:00:00.000Z'
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: 'decision_digest_mismatch',
    });
    await recordOvieCertificationDecision(
      request,
      'founder',
      d,
      '2026-09-27T08:00:00.000Z'
    );
    await expect(
      recordOvieCertificationDecision(
        request,
        'founder',
        d,
        '2026-09-27T08:01:00.000Z'
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: 'duplicate_founder_decision',
    });
  });

  it('refuses marketing decisions without an assurance profile and unknown rows', async () => {
    const d = deps([file]);
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'marketing_components:shell.header' },
        'founder',
        d
      )
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'assurance_profile_missing',
      message: MARKETING_ASSURANCE_GATE,
    });
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'acquisition:lead-1' },
        'founder',
        d
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'flows:missing' },
        'founder',
        d
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
    expect(d.backendInstance.records.size).toBe(0);
  });
});
