import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  insights: vi.fn(),
  runPipeline: vi.fn(),
  listObjections: vi.fn(),
  decideObjection: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/conversation-insights.server', async () => {
  const { z } = await import('zod');
  return {
    getConversationInsights: hoisted.insights,
    runConversationInsightPipeline: hoisted.runPipeline,
    listConversationObjections: hoisted.listObjections,
    decideConversationObjection: hoisted.decideObjection,
    conversationInsightsQuerySchema: z.object({
      weeks: z.coerce.number().int().min(1).max(8).default(4),
    }),
    conversationInsightRunSchema: z.object({
      sampleRate: z.coerce.number().min(0).max(1).default(0.25),
      windowDays: z.coerce.number().int().min(1).max(30).default(7),
      batchLimit: z.coerce.number().int().min(1).max(500).default(200),
    }),
    objectionListQuerySchema: z.object({
      status: z.enum(['draft', 'approved', 'published', 'rejected']).optional(),
      stage: z.enum(['anonymous', 'claimed', 'paid']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    objectionDecisionSchema: z.object({
      decision: z.enum(['approve', 'publish', 'reject']),
      draftedAnswer: z.string().trim().min(1).max(2000).optional(),
      resolutionRef: z.string().trim().min(1).max(500).optional(),
    }),
  };
});
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const insightsRoute = await import(
  '@/app/api/internal/ovie/summer-company/conversation-insights/route'
);
const runRoute = await import(
  '@/app/api/internal/ovie/summer-company/conversation-insights/run/route'
);
const objectionsRoute = await import(
  '@/app/api/internal/ovie/objections/route'
);
const decisionRoute = await import(
  '@/app/api/internal/ovie/objections/[id]/decision/route'
);

const BASE = 'https://jov.ie/api/internal/ovie';

describe('GET /api/internal/ovie/summer-company/conversation-insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without reading insights when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await insightsRoute.GET(
      new Request(`${BASE}/summer-company/conversation-insights`)
    );
    expect(response.status).toBe(401);
    expect(hoisted.insights).not.toHaveBeenCalled();
  });

  it('returns stage insights and objections uncached', async () => {
    hoisted.insights.mockResolvedValue({
      observedAt: '2026-09-27T12:00:00.000Z',
      stages: [
        {
          stage: 'anonymous',
          conversationsThisWeek: 4,
          conversationsLastWeek: 2,
          topObjections: [{ key: 'too_expensive', count: 2 }],
          topAsks: [],
          confusionCount: 1,
          topDropOffPoints: [],
        },
      ],
      objections: [
        {
          key: 'too_expensive',
          objection: 'Price is too high',
          frequency: 2,
          stage: 'anonymous',
          source: 'chat',
          status: 'draft',
        },
      ],
    });
    const response = await insightsRoute.GET(
      new Request(`${BASE}/summer-company/conversation-insights`)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.stages[0].topObjections[0].key).toBe('too_expensive');
  });

  it('fails closed with 503', async () => {
    hoisted.insights.mockRejectedValue(new Error('db down'));
    const response = await insightsRoute.GET(
      new Request(`${BASE}/summer-company/conversation-insights`)
    );
    expect(response.status).toBe(503);
  });
});

describe('POST .../conversation-insights/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await runRoute.POST(
      new Request(`${BASE}/summer-company/conversation-insights/run`, {
        method: 'POST',
      })
    );
    expect(response.status).toBe(401);
    expect(hoisted.runPipeline).not.toHaveBeenCalled();
  });

  it('rejects invalid params with 400', async () => {
    const response = await runRoute.POST(
      new Request(
        `${BASE}/summer-company/conversation-insights/run?sampleRate=2`,
        { method: 'POST' }
      )
    );
    expect(response.status).toBe(400);
  });

  it('runs the pipeline with parsed input', async () => {
    hoisted.runPipeline.mockResolvedValue({ signalsWritten: 3 });
    const response = await runRoute.POST(
      new Request(
        `${BASE}/summer-company/conversation-insights/run?windowDays=14`,
        { method: 'POST' }
      )
    );
    expect(response.status).toBe(200);
    expect(hoisted.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ windowDays: 14 })
    );
  });
});

describe('GET /api/internal/ovie/objections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await objectionsRoute.GET(
      new Request(`${BASE}/objections`)
    );
    expect(response.status).toBe(401);
    expect(hoisted.listObjections).not.toHaveBeenCalled();
  });

  it('rejects invalid filters with 400', async () => {
    const response = await objectionsRoute.GET(
      new Request(`${BASE}/objections?status=bogus`)
    );
    expect(response.status).toBe(400);
  });

  it('lists objections', async () => {
    hoisted.listObjections.mockResolvedValue([
      { objectionKey: 'too_expensive', frequency: 5 },
    ]);
    const response = await objectionsRoute.GET(
      new Request(`${BASE}/objections?status=draft`)
    );
    expect(response.status).toBe(200);
    expect(hoisted.listObjections).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    );
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
  });
});

describe('POST /api/internal/ovie/objections/[id]/decision', () => {
  const params = Promise.resolve({ id: 'obj-1' });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await decisionRoute.POST(
      new Request(`${BASE}/objections/obj-1/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params }
    );
    expect(response.status).toBe(401);
  });

  it('rejects a bad decision body with 400', async () => {
    const response = await decisionRoute.POST(
      new Request(`${BASE}/objections/obj-1/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'yolo' }),
      }),
      { params }
    );
    expect(response.status).toBe(400);
  });

  it('maps not_found and invalid transitions', async () => {
    hoisted.decideObjection.mockResolvedValue({ status: 'not_found' });
    const missing = await decisionRoute.POST(
      new Request(`${BASE}/objections/obj-1/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params }
    );
    expect(missing.status).toBe(404);

    hoisted.decideObjection.mockResolvedValue({
      status: 'invalid',
      reason: 'only_draft_can_be_approved',
    });
    const conflict = await decisionRoute.POST(
      new Request(`${BASE}/objections/obj-1/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params }
    );
    expect(conflict.status).toBe(409);
  });

  it('returns the updated objection', async () => {
    hoisted.decideObjection.mockResolvedValue({
      status: 'updated',
      objection: { id: 'obj-1', status: 'approved' },
    });
    const response = await decisionRoute.POST(
      new Request(`${BASE}/objections/obj-1/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.objection.status).toBe('approved');
  });
});
