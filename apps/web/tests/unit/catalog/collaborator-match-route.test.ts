import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/catalog/collaborators/match/route';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  cosmicGateFixtureSignal,
  theDeepEndFixtureReleaseId,
} from '@/lib/catalog';
import { captureError } from '@/lib/error-tracking';

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

describe('POST /api/catalog/collaborators/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCachedAuth).mockResolvedValue({
      userId: 'clerk-user-1',
      sessionId: 'session-1',
      orgId: null,
    });
  });

  it('returns 401 when the user is not authenticated', async () => {
    vi.mocked(getCachedAuth).mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const response = await POST(
      new Request('http://localhost/api/catalog/collaborators/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal: cosmicGateFixtureSignal }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('matches Cosmic Gate to The Deep End using founder demo fixture catalog', async () => {
    const response = await POST(
      new Request('http://localhost/api/catalog/collaborators/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signal: cosmicGateFixtureSignal,
          fixture: 'founder-demo',
        }),
      })
    );

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      matched: true,
      collaborator: {
        name: 'Cosmic Gate',
        matchMethod: 'provider_id',
      },
      releases: [
        expect.objectContaining({
          id: theDeepEndFixtureReleaseId,
          title: 'The Deep End',
        }),
      ],
    });
  });

  it('returns matched=false for unknown collaborator signals', async () => {
    const response = await POST(
      new Request('http://localhost/api/catalog/collaborators/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signal: { text: 'Unknown Artist is touring this weekend.' },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      matched: false,
      collaborator: null,
      releases: [],
    });
  });

  it('returns 400 for invalid request bodies', async () => {
    const response = await POST(
      new Request('http://localhost/api/catalog/collaborators/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    expect(captureError).not.toHaveBeenCalled();
  });
});
