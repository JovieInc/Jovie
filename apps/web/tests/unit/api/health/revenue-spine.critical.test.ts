import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: mockBuildInfo,
}));

// The route only exercises the pure contract builder; the Sentry delivery
// pipeline is proven by the real-SDK suite in revenue-spine.test.ts.
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn(),
  captureEvent: vi.fn(),
}));

describe('@critical GET /api/health/revenue-spine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBuildInfo.mockResolvedValue({
      buildId: 'build-id',
      version: '1.0.0',
      deployedAt: '2026-10-24T00:00:00.000Z',
      commitSha: 'a'.repeat(40),
      deploymentId: 'dpl_exact123',
      environment: 'production',
    });
  });

  it('emits the shared contract for all nine stages at runtime', async () => {
    const { GET, REVENUE_SPINE_RECEIPT_SCHEMA } = await import(
      '@/app/api/health/revenue-spine/route'
    );
    const { REVENUE_SPINE_STAGES } = await import(
      '@/lib/observability/revenue-spine'
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.schema).toBe(REVENUE_SPINE_RECEIPT_SCHEMA);
    expect(body.contract).toBe('revenue-spine-failure/v1');
    expect(body.commitSha).toBe('a'.repeat(40));
    expect(body.deploymentId).toBe('dpl_exact123');
    expect(body.environment).toBe('production');
    expect(typeof body.generatedAt).toBe('string');

    expect(body.stages).toHaveLength(REVENUE_SPINE_STAGES.length);
    expect(body.stages.map((stage: { stage: string }) => stage.stage)).toEqual([
      ...REVENUE_SPINE_STAGES,
    ]);
    for (const stage of body.stages) {
      // The real classifier derives the failure code from the probe error.
      expect(stage.failure_code).toBe('timeout');
      expect(stage.fingerprint).toBe(`revenue-spine:v1:${stage.stage}:timeout`);
      // Synthetic probes declare unverified impact and never attribute a user.
      expect(stage.severity).toBe('unknown');
      expect(stage.affected_user_id).toBeNull();
      expect(stage.event_count).toBe(1);
      expect(stage.contract).toBe('revenue-spine-failure/v1');
      expect(Object.keys(stage).sort()).toEqual([
        'affected_user_id',
        'contract',
        'event_count',
        'failure_code',
        'fingerprint',
        'severity',
        'stage',
      ]);
    }
  });

  it('marks the receipt no-store at browser and CDN layers (JOV-1958 pattern)', async () => {
    const { GET } = await import('@/app/api/health/revenue-spine/route');
    const response = await GET();

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('cache-control')).not.toMatch(/s-maxage=\d+/);
    expect(response.headers.get('cache-control')).not.toMatch(/max-age=[1-9]/);
  });

  it('fails visibly instead of serving a receipt the build cannot produce', async () => {
    vi.doMock('@/lib/observability/revenue-spine', async importOriginal => {
      const actual =
        await importOriginal<
          typeof import('@/lib/observability/revenue-spine')
        >();
      return {
        ...actual,
        buildRevenueSpineFailure: vi.fn(() => {
          throw new Error('Invalid revenue spine failure contract');
        }),
      };
    });
    try {
      const { GET } = await import('@/app/api/health/revenue-spine/route');
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'revenue_spine_receipt_unavailable',
      });
    } finally {
      vi.doUnmock('@/lib/observability/revenue-spine');
    }
  });
});
