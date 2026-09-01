import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const returning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  return {
    requireAuth: vi.fn(),
    reconcile: vi.fn(),
    recordDecision: vi.fn(),
    captureError: vi.fn(),
    select,
    selectLimit,
    update,
    returning,
  };
});

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));
vi.mock('@/lib/db', () => ({
  db: { select: hoisted.select, update: hoisted.update },
}));
vi.mock('@/lib/db/schema/connectors', () => ({
  suggestedActions: {
    id: 'id',
    userId: 'userId',
    kind: 'kind',
    payload: 'payload',
    status: 'status',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...values: unknown[]) => values,
  eq: (column: unknown, value: unknown) => [column, value],
}));
vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: hoisted.recordDecision,
}));
vi.mock('@/lib/youtube-library', () => ({
  reconcileThumbnailCandidateDecision: hoisted.reconcile,
  YouTubeThumbnailDecisionError: class YouTubeThumbnailDecisionError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { POST } from '@/app/api/connectors/suggested-actions/[id]/reject/route';

const payload = {
  schemaVersion: 1,
  title: 'Review thumbnail for A song',
  creatorProfileId: '00000000-0000-4000-8000-000000000010',
  channelId: 'UC-owned',
  youtubeVideoId: 'video-1',
  videoTitle: 'A song',
  candidateThumbnailVersionId: '00000000-0000-4000-8000-000000000011',
  candidateImageUrl: 'https://cdn.example.com/candidate.jpg',
  currentThumbnailUrl: 'https://i.ytimg.com/current.jpg',
  artifactSha256:
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  apiMetrics: {
    source: 'youtube-analytics-api',
    window: 'lifetime',
    capturedAt: '2026-09-01T12:00:00.000Z',
    views: 1250,
    watchTimeMinutes: 300,
    avgViewDurationSeconds: 42,
    impressions: null,
    ctr: null,
  },
  publicationGate: {
    state: 'blocked',
    reason: 'direct-thumbnail-mutation-disabled-native-experiment-required',
    requiredProof: [
      'founder-candidate-approval',
      'youtube-studio-native-experiment',
      'provider-readback-receipt',
    ],
  },
};

function request() {
  return new Request('http://localhost/api/reject', { method: 'POST' });
}

const params = {
  params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000020' }),
};

describe('YouTube candidate reject route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
      error: null,
    });
    hoisted.selectLimit.mockResolvedValue([
      {
        kind: 'youtube.thumbnail_candidate',
        payload,
        status: 'pending',
      },
    ]);
    hoisted.returning.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000020',
        kind: 'youtube.thumbnail_candidate',
      },
    ]);
    hoisted.reconcile.mockResolvedValue({ state: 'rejected' });
  });

  it('reconciles the append-only candidate after the action CAS', async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(hoisted.reconcile).toHaveBeenCalledWith({
      suggestedActionId: '00000000-0000-4000-8000-000000000020',
      userId: '00000000-0000-4000-8000-000000000001',
      payload,
      decision: 'rejected',
    });
    expect(hoisted.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'rejected' })
    );
  });

  it('repairs a prior partial failure when rejection is retried', async () => {
    hoisted.selectLimit.mockResolvedValueOnce([
      {
        kind: 'youtube.thumbnail_candidate',
        payload,
        status: 'rejected',
      },
    ]);

    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'rejected' });
    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.reconcile).toHaveBeenCalledOnce();
  });

  it('does no work when authentication fails', async () => {
    hoisted.requireAuth.mockResolvedValueOnce({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const response = await POST(request(), params);
    expect(response.status).toBe(401);
    expect(hoisted.select).not.toHaveBeenCalled();
  });
});
