import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getLatestDailyPost: vi.fn(),
  isPostDismissed: vi.fn(),
  dismissPost: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: m.auth }));
vi.mock('@/lib/release-communications/drizzle-adapter', () => ({
  DrizzleReleaseCommunicationsAdapter: class {
    getLatestDailyPost = m.getLatestDailyPost;
    isPostDismissed = m.isPostDismissed;
    dismissPost = m.dismissPost;
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST } from './dismiss/route';
import { GET } from './route';

const POST_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  product: 'jovie',
  app: 'web',
  localDate: '2026-10-02',
  entries: [
    {
      id: 'e1',
      eventKey: 'k1',
      repository: 'JovieInc/Jovie',
      pullRequestNumber: 1,
      mergeSha: 'a',
      app: 'web',
      title: 'Profile links are one tap',
      body: null,
      url: null,
      material: true,
      audienceEligible: true,
      metadata: {},
    },
    {
      id: 'e2',
      eventKey: 'k2',
      repository: 'JovieInc/Jovie',
      pullRequestNumber: 2,
      mergeSha: 'b',
      app: 'web',
      title: 'Internal tooling',
      body: null,
      url: null,
      material: false,
      audienceEligible: false,
      metadata: {},
    },
  ],
};

const dismissRequest = (body: unknown) =>
  new Request('https://jov.ie/api/whats-new/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

describe('GET /api/whats-new', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ userId: 'user-1' });
    m.getLatestDailyPost.mockResolvedValue(POST_ROW);
    m.isPostDismissed.mockResolvedValue(false);
  });

  it('stays silent when unauthenticated', async () => {
    m.auth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(await res.json()).toEqual({ prompt: null });
  });

  it('presents the daily post when it has material entries', async () => {
    const res = await GET();
    const { prompt } = await res.json();
    expect(prompt).toMatchObject({
      contractVersion: 'release-communications/v1',
      postId: POST_ROW.id,
      localDate: '2026-10-02',
      title: 'Profile links are one tap',
      materialCount: 1,
    });
  });

  it('suppresses a minor-only post', async () => {
    m.getLatestDailyPost.mockResolvedValue({
      ...POST_ROW,
      entries: POST_ROW.entries.filter(entry => !entry.material),
    });
    expect(await (await GET()).json()).toEqual({ prompt: null });
  });

  it('suppresses a post the user dismissed', async () => {
    m.isPostDismissed.mockResolvedValue(true);
    expect(await (await GET()).json()).toEqual({ prompt: null });
  });
});

describe('POST /api/whats-new/dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ userId: 'user-1' });
    m.dismissPost.mockResolvedValue(undefined);
  });

  it('requires auth and a canonical post id', async () => {
    m.auth.mockResolvedValue({ userId: null });
    expect((await POST(dismissRequest({ postId: POST_ROW.id }))).status).toBe(
      401
    );
    m.auth.mockResolvedValue({ userId: 'user-1' });
    expect((await POST(dismissRequest({ postId: 'nope' }))).status).toBe(400);
    expect(m.dismissPost).not.toHaveBeenCalled();
  });

  it('records one whole-post dismissal for the user', async () => {
    const res = await POST(dismissRequest({ postId: POST_ROW.id }));
    expect(res.status).toBe(200);
    expect(m.dismissPost).toHaveBeenCalledWith({
      postId: POST_ROW.id,
      userId: 'user-1',
    });
  });
});
