import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/memory/graph/route';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { queryMemoryGraph } from '@/lib/memory/graph-query';

const hoisted = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCaptureError: vi.fn(),
  mockLimit: vi.fn(),
  mockQueryMemoryGraph: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: hoisted.mockLimit,
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.mockCaptureError,
}));

vi.mock('@/lib/memory/graph-query', () => ({
  queryMemoryGraph: hoisted.mockQueryMemoryGraph,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('GET /api/memory/graph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockAuth.mockResolvedValue({ userId: 'clerk-user-1' });
    hoisted.mockLimit.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        activeProfileId: '00000000-0000-4000-8000-000000000002',
      },
    ]);
    hoisted.mockQueryMemoryGraph.mockResolvedValue({
      entities: [{ id: 'entity-1' }],
      aliases: [],
      identities: [],
      observations: [],
      edges: [],
      assets: [],
      assetMentions: [],
      events: [],
      eventParticipants: [],
      opportunities: [],
    });
  });

  it('returns 401 when the user is not authenticated', async () => {
    vi.mocked(getCachedAuth).mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const response = await GET(
      new Request('http://localhost/api/memory/graph')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(db.select).not.toHaveBeenCalled();
    expect(queryMemoryGraph).not.toHaveBeenCalled();
  });

  it('returns 404 when the user has no active creator profile', async () => {
    hoisted.mockLimit.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        activeProfileId: null,
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/memory/graph')
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'No active creator profile.',
    });
    expect(queryMemoryGraph).not.toHaveBeenCalled();
  });

  it('queries the graph with strict user and creator profile scope', async () => {
    const response = await GET(
      new Request('http://localhost/api/memory/graph?entityId=entity-1')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      graph: {
        entities: [{ id: 'entity-1' }],
        aliases: [],
        identities: [],
        observations: [],
        edges: [],
        assets: [],
        assetMentions: [],
        events: [],
        eventParticipants: [],
        opportunities: [],
      },
    });
    expect(queryMemoryGraph).toHaveBeenCalledWith(
      {
        userId: '00000000-0000-4000-8000-000000000001',
        creatorProfileId: '00000000-0000-4000-8000-000000000002',
      },
      { entityId: 'entity-1' }
    );
  });

  it('captures graph query failures and returns a bounded error response', async () => {
    hoisted.mockQueryMemoryGraph.mockRejectedValue(new Error('graph failed'));

    const response = await GET(
      new Request('http://localhost/api/memory/graph')
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to load memory graph.',
    });
    expect(captureError).toHaveBeenCalledWith(
      'Memory graph query failed',
      expect.any(Error),
      { route: '/api/memory/graph' }
    );
  });
});
