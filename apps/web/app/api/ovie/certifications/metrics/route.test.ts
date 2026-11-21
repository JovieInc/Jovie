import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dogfoodReceiptProvesOutcome } from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import type { CertificationPacketFileRead } from '@/lib/ovie/certifications/packet-files.server';
import {
  buildPublicProfileScriptedFalseSuccess,
  PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
  PUBLIC_PROFILE_FIXTURE_DEPLOY,
  seedPublicProfileDogfoodFixture,
} from '@/lib/ovie/certifications/public-profile-dogfood-fixture';
import { QUALITY_OUTCOME_RECEIPT_SCHEMA } from '@/lib/ovie/certifications/quality-scoreboard';
import { recordQualityOutcomeReceipt } from '@/lib/ovie/certifications/quality-scoreboard-ledger';
import { recordDogfoodReceipt } from '@/lib/ovie/certifications/dogfood-receipt-ledger';
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
    {
      domain: 'public_profiles',
      surface: 'Public Profile',
      packetUpdatedAt: '2026-09-27T07:00:00.000Z',
      links: [],
      packet: fixturePacket(PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID, {
        subject: {
          id: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
          kind: 'surface',
          title: 'Public Profile',
        },
      }),
      file: 'docs/certification/2026-09-27/public-profile.packet.json',
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
    // Two packet-file subjects; dogfood ledger disconnected → empty feed.
    expect(jov.machineCertifiableCoverage).toEqual({ value: 0, sampleSize: 2 });
    expect(jov.judgeCalibration).toEqual([]);
    expect(body.dogfoodFeed).toEqual({
      status: 'disconnected',
      receiptCount: 0,
      subjectsWithRequiredMissions: 1,
      subjectsWithDeploy: 0,
      knownGoodDeploymentCount: 0,
    });
  });

  it('feeds dogfood receipts and required missions into the projection (empty→fed)', async () => {
    const emptyBody = await (await GET(request())).json();
    expect(emptyBody.dogfoodFeed.status).toBe('disconnected');
    expect(emptyBody.dogfoodFeed.receiptCount).toBe(0);
    expect(emptyBody.dogfoodFeed.subjectsWithRequiredMissions).toBe(1);
    expect(emptyBody.lanes.jov.dogfoodKindCoverage.value).toBe(0);

    const backend = memoryCertificationBackend();
    await seedPublicProfileDogfoodFixture({
      backend,
      recordedAt: new Date().toISOString(),
    });
    mocks.backend.mockReturnValue(backend);

    const fedBody = await (await GET(request())).json();
    expect(fedBody.dogfoodFeed).toMatchObject({
      status: 'fixture',
      receiptCount: 1,
      subjectsWithRequiredMissions: 1,
      subjectsWithDeploy: 1,
      knownGoodDeploymentCount: 1,
    });
    // public-profile proves one kind; signup has none → mean 0.5
    expect(fedBody.lanes.jov.dogfoodKindCoverage).toEqual({
      value: 0.5,
      sampleSize: 2,
    });
    expect(fedBody.lanes.jov.driverReliability.playwright).toEqual({
      value: 1,
      sampleSize: 1,
    });
  });

  it('rejects a deliberate scripted false-success from dogfood kind coverage', async () => {
    const backend = memoryCertificationBackend();
    const now = new Date().toISOString();
    const startedAt = new Date(Date.parse(now) - 60_000).toISOString();
    await seedPublicProfileDogfoodFixture({
      backend,
      recordedAt: now,
      includeCapabilityReceipt: false,
    });
    const falseSuccess = buildPublicProfileScriptedFalseSuccess({
      commitSha: PUBLIC_PROFILE_FIXTURE_DEPLOY.commitSha,
      deploymentId: PUBLIC_PROFILE_FIXTURE_DEPLOY.deploymentId,
      startedAt,
      completedAt: now,
    });
    expect(falseSuccess.outcome).toBe('failed');
    expect(
      dogfoodReceiptProvesOutcome(falseSuccess, {
        id: getCanonicalSurface('public-profile').outcomeMission.id,
        outcome: getCanonicalSurface('public-profile').outcomeMission.outcome,
      })
    ).toBe(false);
    await recordDogfoodReceipt({
      backend,
      receipt: falseSuccess,
      recordedAt: now,
    });
    mocks.backend.mockReturnValue(backend);

    const body = await (await GET(request())).json();
    expect(body.dogfoodFeed.receiptCount).toBe(1);
    expect(body.dogfoodFeed.status).toBe('fixture');
    // Scripted false-success is present but does not prove an outcome kind.
    expect(body.lanes.jov.dogfoodKindCoverage).toEqual({
      value: 0,
      sampleSize: 2,
    });
    expect(body.lanes.jov.machineCertifiableCoverage).toEqual({
      value: 0,
      sampleSize: 2,
    });
  });

  it('counts founder-facing Summer cards toward cards per day', async () => {
    // One day before the clock this test actually runs, so the card stays
    // inside the 30-day metrics window after the wall clock moves.
    const createdAt = new Date(Date.now() - 86_400_000).toISOString();
    mocks.cards.mockResolvedValue([
      {
        id: 'sc_1',
        kind: 'taste',
        product: 'jov',
        createdAt,
      },
      {
        id: 'sc_2',
        kind: 'spend', // not founder-facing: excluded
        product: 'jov',
        createdAt,
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
