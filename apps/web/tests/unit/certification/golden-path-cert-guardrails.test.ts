import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redis: null as null | {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@/lib/redis', () => ({ getRedis: () => hoisted.redis }));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: vi.fn(),
}));
vi.mock('@/lib/admin/ops-queries', () => ({
  getAuthSignupOnboardingCanaryStatus: vi.fn(),
  getPublicProfileCanaryStatus: vi.fn(),
}));
vi.mock('@/lib/github/hud-token.server', () => ({
  resolveHudGithubToken: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  env: { HUD_GITHUB_OWNER: 'JovieInc', HUD_GITHUB_REPO: 'Jovie' },
}));

import {
  CONE_WORKFLOWS,
  REVENUE_CONE_REQUIREMENTS,
} from '@/lib/acquisition/eligibility';
import {
  computeAcquisitionEligibility,
  defaultAcquisitionEligibilityDeps,
} from '@/lib/acquisition/eligibility.server';
import {
  DAILY_WORKFLOW_MAX_AGE_MS,
  REQUIRED_ELIGIBILITY_SOURCES,
  revalidateAcquisitionEligibilityReport,
} from '@/lib/acquisition/eligibility-cache';
import { resolveHudGithubToken } from '@/lib/github/hud-token.server';
import { serverFetch } from '@/lib/http/server-fetch';
import {
  goldenPathStatus,
  PROD_CERT_STEP_CHECKS,
} from '@/lib/ovie/certifications/golden-path-status';
import {
  certifiedProdGoldenPathSurfaces,
  isFreshProdGoldenPathPass,
  type ProdGoldenPathLedger,
  type ProdGoldenPathReceipt,
  prodGoldenPathPacketFiles,
} from '@/lib/ovie/certifications/prod-golden-path-ledger';
import {
  EXPECTED_BROWSER_CHECKS,
  runProductionCertification,
} from '../../../../../scripts/lib/prod-cert.mjs';
import {
  COMMERCE_REQUIREMENT_IDS,
  fakeProdCertFetch,
  greenDeps,
  NOW,
  RECENT,
  SHA,
} from './golden-path-cert-fixtures';

describe('closed-loop Golden Path certification & eligibility guardrails', () => {
  const fetchMock = vi.mocked(serverFetch);

  beforeEach(() => {
    fetchMock.mockReset();
    hoisted.redis = null;
    vi.mocked(resolveHudGithubToken).mockResolvedValue('token');
  });

  it('keeps PROD_CERT_STEP_CHECKS in exact lockstep with runProductionCertification checks', async () => {
    const browserSteps = Object.entries(EXPECTED_BROWSER_CHECKS).flatMap(
      ([surface, ids]) => [
        { kind: 'capabilities', surface, ids },
        ...ids.map(id => ({
          surface,
          id,
          status: 'passed',
          startedAt: RECENT,
          endedAt: RECENT,
          summary: 'ok',
        })),
      ]
    );
    const runProdCert = runProductionCertification as (
      input: Record<string, unknown>
    ) => Promise<{ receipts: ProdGoldenPathReceipt[] }>;
    const { receipts } = await runProdCert({
      fetchImpl: fakeProdCertFetch(),
      now: () => RECENT,
      authStatus: 'passed',
      producerSourceSha: SHA,
      coneCases: true,
      steps: browserSteps,
    });
    const receiptBySurface = new Map<string, ProdGoldenPathReceipt>(
      receipts.map(r => [r.surface, r])
    );

    for (const [stepId, sources] of Object.entries(PROD_CERT_STEP_CHECKS)) {
      for (const source of sources ?? []) {
        const receipt = receiptBySurface.get(source.surface);
        expect(
          receipt,
          `step ${stepId} references unknown surface ${source.surface}`
        ).toBeDefined();
        const emittedIds = new Set(receipt!.checks.map(c => c.id));
        for (const checkId of source.checkIds) {
          expect(
            emittedIds.has(checkId),
            `step ${stepId} maps ${source.surface}/${checkId}, which runProductionCertification did not emit`
          ).toBe(true);
        }
      }
    }

    const ledger: ProdGoldenPathLedger = {
      schemaVersion: 1,
      contract: 'jovie.prod-golden-path-ledger/v1',
      updatedAt: RECENT,
      surfaces: Object.fromEntries(
        receipts.map(latest => [
          latest.surface,
          { latest, lastPassedSha: null, history: [] },
        ])
      ),
    };
    const projected = goldenPathStatus(ledger, NOW);
    const stepStatus = Object.fromEntries(
      projected.steps.map(s => [s.id, s.status])
    );
    expect(stepStatus).toEqual({
      outreach: 'missing',
      'claim-landing': 'passed',
      start: 'passed',
      'qualify-chat': 'passed',
      'profile-reveal': 'passed',
      'claim-decision': 'passed',
      upgrade: 'passed',
      'hosted-test-checkout': 'missing',
      'paid-value': 'missing',
      'first-use': 'passed',
    });
    expect(projected.stepsPassed).toBe(7);
  });

  it('fails closed on future and unparseable timestamps across all certification projections', () => {
    const nowMs = NOW.getTime();
    const future = new Date(nowMs + 10 * 60_000).toISOString();
    expect(isFreshProdGoldenPathPass(RECENT, nowMs)).toBe(true);
    expect(isFreshProdGoldenPathPass(future, nowMs)).toBe(false);
    expect(isFreshProdGoldenPathPass('not-a-timestamp', nowMs)).toBe(false);

    const makePass = (surface: string, endedAt: string) =>
      ({
        schema: 'jovie.prod-golden-path-receipt/v1',
        surface,
        status: 'passed',
        sha: SHA,
        deploymentId: null,
        startedAt: endedAt,
        endedAt,
        runUrl: null,
        screenIds: ['web.homepage'],
        identity: 'anonymous',
        checks: [
          {
            id: 'landing-renders',
            status: 'passed',
            startedAt: endedAt,
            endedAt,
            summary: 'ok',
          },
        ],
        blocker: null,
        issueUrl: null,
        observations: [],
      }) as unknown as ProdGoldenPathReceipt;

    const ledger: ProdGoldenPathLedger = {
      schemaVersion: 1,
      contract: 'jovie.prod-golden-path-ledger/v1',
      updatedAt: RECENT,
      surfaces: {
        landing: {
          latest: makePass('landing', future),
          lastPassedSha: SHA,
          history: [],
        },
        claim: {
          latest: makePass('claim', 'invalid-date'),
          lastPassedSha: SHA,
          history: [],
        },
      },
    };
    expect(certifiedProdGoldenPathSurfaces(ledger, nowMs)).toEqual([]);
    const status = goldenPathStatus(ledger, NOW);
    expect(status.certified).toBe(0);
    expect(status.surfaces.find(s => s.id === 'landing')?.status).toBe(
      'expired'
    );
    expect(status.surfaces.find(s => s.id === 'claim')?.status).toBe('expired');
    const packets = prodGoldenPathPacketFiles(ledger, { nowMs });
    expect(packets[0].packet.operational?.runtimeDogfood?.[0]?.status).toBe(
      'pending'
    );
  });

  it('registers every non-commerce eligibility source in REQUIRED_ELIGIBILITY_SOURCES and enforces buyer_would_pay in cache revalidation', async () => {
    const report = await computeAcquisitionEligibility(greenDeps());
    expect(report.eligible).toBe(true);

    for (const req of REVENUE_CONE_REQUIREMENTS) {
      if (COMMERCE_REQUIREMENT_IDS.has(req.id)) continue;
      const expected = REQUIRED_ELIGIBILITY_SOURCES[req.id];
      expect(
        expected && Object.keys(expected).length > 0,
        `non-commerce requirement ${req.id} must be registered in REQUIRED_ELIGIBILITY_SOURCES`
      ).toBe(true);
      const row = report.requirements.find(r => r.id === req.id);
      expect(row).toBeDefined();
      for (const item of row!.evidence) {
        expect(expected![item.source]).toBe(item.maxAgeMs);
      }
    }

    // Stripping buyer_would_pay's required workflow source must fail closed.
    const missingBuyerSource = {
      ...report,
      requirements: report.requirements.map(r =>
        r.id === 'buyer_would_pay'
          ? {
              ...r,
              evidence: [{ ...r.evidence[0], source: 'forged:buyer-source' }],
            }
          : r
      ),
    };
    const revalidatedMissing = revalidateAcquisitionEligibilityReport(
      missingBuyerSource,
      NOW
    );
    expect(revalidatedMissing?.eligible).toBe(false);
    expect(revalidatedMissing?.firstBlocker?.id).toBe('buyer_would_pay');

    // Inflating buyer_would_pay's maxAgeMs past DAILY_WORKFLOW_MAX_AGE_MS cannot keep a stale receipt green.
    const staleObservedAt = new Date(
      NOW.getTime() - (DAILY_WORKFLOW_MAX_AGE_MS + 60_000)
    ).toISOString();
    const inflatedBuyerBudget = {
      ...report,
      requirements: report.requirements.map(r =>
        r.id === 'buyer_would_pay'
          ? {
              ...r,
              evidence: [
                {
                  ...r.evidence[0],
                  maxAgeMs: 90 * 24 * 60 * 60_000,
                  observedAt: staleObservedAt,
                },
              ],
            }
          : r
      ),
    };
    const revalidatedInflated = revalidateAcquisitionEligibilityReport(
      inflatedBuyerBudget,
      NOW
    );
    expect(revalidatedInflated?.eligible).toBe(false);
    expect(revalidatedInflated?.firstBlocker?.id).toBe('buyer_would_pay');
  });

  it('reads both push and workflow_dispatch main runs for Golden Path so push failures cannot hide behind an older dispatch', async () => {
    const json = (body: unknown, status = 200) =>
      ({
        json: async () => body,
        ok: status < 400,
        status,
      }) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce(
        json({
          workflow_runs: [
            {
              id: 300,
              event: 'schedule',
              conclusion: 'success',
              created_at: RECENT,
              head_sha: 'c'.repeat(40),
              html_url: 'https://github.com/run/300',
            },
            {
              id: 200,
              event: 'push',
              conclusion: 'failure',
              created_at: RECENT,
              head_sha: 'b'.repeat(40),
              html_url: 'https://github.com/run/200',
            },
            {
              id: 100,
              event: 'workflow_dispatch',
              conclusion: 'success',
              created_at: '2026-11-19T06:00:00.000Z',
              head_sha: SHA,
              html_url: 'https://github.com/run/100',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        json({
          jobs: [{ name: 'Golden Path (manual)', conclusion: 'failure' }],
        })
      );

    const read = await defaultAcquisitionEligibilityDeps.readWorkflowRun(
      CONE_WORKFLOWS.goldenPath
    );
    expect(read).toEqual({
      status: 'observed',
      run: {
        conclusion: 'failure',
        createdAt: RECENT,
        headSha: 'b'.repeat(40),
        url: 'https://github.com/run/200',
      },
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/actions/runs/200/jobs'
    );
  });
});
