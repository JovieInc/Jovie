import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import type { CertificationPacketFileRead } from '@/lib/ovie/certifications/packet-files.server';
import { QUALITY_OUTCOME_RECEIPT_SCHEMA } from '@/lib/ovie/certifications/quality-scoreboard';
import { recordQualityOutcomeReceipt } from '@/lib/ovie/certifications/quality-scoreboard-ledger';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  backend: vi.fn(),
  packetFiles: vi.fn(),
  cards: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
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
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  listSummerCards: mocks.cards,
}));

const request = () =>
  new Request('https://jov.ie/api/ovie/certifications/metrics');

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

describe('GET /api/ovie/certifications/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
    mocks.backend.mockReturnValue(memoryCertificationBackend());
    mocks.packetFiles.mockResolvedValue(packetRead);
    mocks.cards.mockResolvedValue([]);
  });

  it('rejects unauthenticated and non-admin callers before reading stores', async () => {
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
    expect(mocks.packetFiles).not.toHaveBeenCalled();
    expect(mocks.cards).not.toHaveBeenCalled();
  });

  it('returns the metrics contract with no-store and per-lane metrics', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();

    expect(body.contract).toBe('jovie.certification-metrics/v1');
    expect(body.qualityScoreboard).toMatchObject({
      contract: 'jovie.summer-quality-scoreboard/v1',
      source: { status: 'disconnected', receiptCount: 0 },
      engineeringActivity: { role: 'diagnostic_only' },
    });
    expect(Object.keys(body.lanes).sort()).toEqual(['jov', 'lyb', 'ovie']);
    const jov = body.lanes.jov;
    for (const key of [
      'founderBlockingMinutes',
      'fleetHardening',
      'founderCardsPerDay',
      'silencePromotionRegretPer100',
      'escapedDefectsPer100Promotions',
      'dogfoodCatchRate',
      'machineCertifiableCoverage',
      'dogfoodKindCoverage',
      'driverReliability',
      'canaryCoverage',
      'judgeCalibration',
      'escalationMix',
      'cycleTime',
      'killSwitchMttrMinutes',
      'signalHealth',
      'byRiskClass',
    ]) {
      expect(jov).toHaveProperty(key);
    }
    expect(Object.keys(jov.byRiskClass).sort()).toEqual(
      ['money_path', 'presentation', 'product'].sort()
    );
    // One packet-file subject exists; stores with no data yield null metrics.
    expect(jov.machineCertifiableCoverage).toEqual({ value: 0, sampleSize: 1 });
    expect(jov.judgeCalibration).toEqual([]);
  });

  it('counts founder-facing Summer cards toward cards per day', async () => {
    mocks.cards.mockResolvedValue([
      {
        id: 'sc_1',
        kind: 'taste',
        product: 'jov',
        createdAt: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'sc_2',
        kind: 'spend', // not founder-facing: excluded
        product: 'jov',
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ]);
    const body = await (await GET(request())).json();
    expect(body.lanes.jov.founderCardsPerDay.sampleSize).toBe(1);
    expect(body.lanes.jov.founderCardsPerDay.value).toBeGreaterThan(0);
  });

  it('projects exact before, after, deploy, and retest evidence from the durable ledger', async () => {
    const backend = memoryCertificationBackend();
    const now = new Date().toISOString();
    const link = (ref: string) => ({ ref, observedAt: now });
    await recordQualityOutcomeReceipt({
      backend,
      recordedAt: now,
      receipt: {
        schema: QUALITY_OUTCOME_RECEIPT_SCHEMA,
        id: 'verified-profile-freshness',
        kind: 'verified_improvement',
        product: 'jov',
        affectedSurface: 'public-profile',
        occurredAt: now,
        authority: {
          producer: 'certification',
          receipt: link('certification://profile-freshness'),
        },
        customerOutcome: 'Visitors receive a fresh public profile.',
        desiredDirection: 'increase',
        before: {
          value: 72,
          unit: 'fresh_profiles_percent',
          evidence: link('analytics://profile-freshness/before'),
        },
        after: {
          value: 99,
          unit: 'fresh_profiles_percent',
          evidence: link('analytics://profile-freshness/after'),
        },
        deployment: {
          commitSha: 'a'.repeat(40),
          deploymentId: 'production-profile-001',
          deployed: link('deploy://production-profile-001'),
          retest: link('retest://production-profile-001'),
        },
      },
    });
    mocks.backend.mockReturnValue(backend);

    const body = await (await GET(request())).json();
    expect(
      body.qualityScoreboard.productOutcomes.views.verifiedImprovements[0]
    ).toMatchObject({
      before: { evidence: { ref: 'analytics://profile-freshness/before' } },
      after: { evidence: { ref: 'analytics://profile-freshness/after' } },
      deployment: {
        deployed: { ref: 'deploy://production-profile-001' },
        retest: { ref: 'retest://production-profile-001' },
      },
    });
  });
});
