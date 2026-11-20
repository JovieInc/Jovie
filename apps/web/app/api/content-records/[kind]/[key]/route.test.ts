import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writer: { ok: true, actor: 'agent:summer' } as
    | { ok: true; actor: string }
    | { ok: false; status: 401 | 403; error: string },
  createContentVersion: vi.fn(),
  publishContentVersion: vi.fn(),
  rollbackContent: vi.fn(),
  getContentHistory: vi.fn(),
  getContentReviewIdentity: vi.fn(),
  approveContentVersion: vi.fn(),
}));

vi.mock('@/lib/content-records/access.server', () => ({
  resolveContentWriter: vi.fn(async () => mocks.writer),
  signPreviewToken: vi.fn(
    (identity: { versionId: string }) => `tok-${identity.versionId}`
  ),
}));

vi.mock('@/lib/content-records/store.server', async () => {
  class ContentValidationError extends Error {
    constructor(readonly errors: readonly string[]) {
      super('invalid');
    }
  }
  class ContentConflictError extends Error {}
  class ContentAuthorizationError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  class ContentPublicationUncertainError extends Error {
    constructor(readonly operationId: string) {
      super('uncertain');
    }
  }
  return {
    ContentAuthorizationError,
    ContentPublicationUncertainError,
    ContentValidationError,
    ContentConflictError,
    createContentVersion: mocks.createContentVersion,
    publishContentVersion: mocks.publishContentVersion,
    rollbackContent: mocks.rollbackContent,
    getContentHistory: mocks.getContentHistory,
    getContentReviewIdentity: mocks.getContentReviewIdentity,
    approveContentVersion: mocks.approveContentVersion,
  };
});

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const VERSION_ID = '5f0f4c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f';
const publication = {
  expectedLiveVersionId: null,
  operationId: '3a0b693e-01e4-4b29-b5cd-29218ce5c951',
  approvalId: '1d151341-7e35-4d55-acce-60c20c35bc28',
};
const review = {
  versionId: VERSION_ID,
  kind: 'marketing-page',
  key: 'home',
  schemaVersion: 1,
  payloadDigest: 'b'.repeat(64),
  renderRevision: 'a'.repeat(40),
  renderBuildId: 'build-a',
  expectedLiveVersionId: null,
  previewArm: null,
  reviewDigest: 'c'.repeat(64),
};
const move = (action: string) => ({
  action,
  toVersionId: VERSION_ID,
  cacheInvalidation: 'complete',
  readback: { source: 'live', versionId: VERSION_ID },
  delivery: 'unverified',
});

async function call(
  method: 'GET' | 'POST',
  body?: unknown,
  params = { kind: 'marketing-page', key: 'home' }
) {
  const route = await import('./route');
  const request = new Request(
    'https://jov.ie/api/content-records/marketing-page/home',
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
  const handler = method === 'GET' ? route.GET : route.POST;
  const response = await handler(request, { params: Promise.resolve(params) });
  if (!response) throw new Error('handler returned no response');
  return { status: response.status, json: await response.json() };
}

async function validSpec() {
  const { DEFAULT_HOME_SPEC } = await import(
    '@/lib/content-records/marketing-page'
  );
  const spec = structuredClone(DEFAULT_HOME_SPEC);
  const hero = spec.sections[0];
  if (hero?.section === 'hero') hero.copy.subhead = 'A free profile for you.';
  return spec;
}

describe('/api/content-records/[kind]/[key]', () => {
  beforeEach(() => {
    mocks.writer = { ok: true, actor: 'agent:summer' };
    vi.clearAllMocks();
    mocks.getContentReviewIdentity.mockResolvedValue(review);
    mocks.publishContentVersion.mockResolvedValue(move('publish'));
    mocks.rollbackContent.mockResolvedValue(move('rollback'));
  });

  it('rejects callers who are not writers', async () => {
    mocks.writer = { ok: false, status: 401, error: 'Unauthorized' };
    expect((await call('GET')).status).toBe(401);
    expect((await call('POST', { action: 'validate', data: {} })).status).toBe(
      401
    );
  });

  it('404s unknown kinds and keys', async () => {
    expect(
      (await call('GET', undefined, { kind: 'nope', key: 'home' })).status
    ).toBe(404);
    expect(
      (await call('GET', undefined, { kind: 'marketing-page', key: 'x' }))
        .status
    ).toBe(404);
  });

  it('refuses drafts of a producer-only kind but allows its rollback', async () => {
    const params = { kind: 'proof-stats', key: 'observations' };
    const draft = await call(
      'POST',
      { action: 'draft', data: { schemaVersion: 1, observations: {} } },
      params
    );
    expect(draft.status).toBe(403);
    expect(draft.json.error).toMatch(/written only by its producer/);
    const rollback = await call(
      'POST',
      { action: 'rollback', reason: 'bad number', ...publication },
      params
    );
    expect(rollback.status).toBe(200);
  });

  it('validates a spec without storing it', async () => {
    expect(
      await call('POST', { action: 'validate', data: await validSpec() })
    ).toEqual({ status: 200, json: { ok: true } });
    const bad = await call('POST', {
      action: 'validate',
      data: { sections: [] },
    });
    expect(bad.status).toBe(422);
    expect(mocks.createContentVersion).not.toHaveBeenCalled();
  });

  it('stores a draft as the acting writer and returns a signed preview', async () => {
    mocks.createContentVersion.mockResolvedValue({
      id: VERSION_ID,
      version: 3,
      data: {},
    });
    const result = await call('POST', {
      action: 'draft',
      data: await validSpec(),
      note: 'subhead test',
    });
    expect(result.status).toBe(201);
    expect(result.json.version).toEqual({ id: VERSION_ID, version: 3 });
    const preview = new URL(result.json.previewUrl);
    expect(preview.pathname).toBe(`/content-preview/${VERSION_ID}`);
    expect(preview.searchParams.get('token')).toBe(`tok-${VERSION_ID}`);
    expect(preview.searchParams.get('digest')).toBe(review.reviewDigest);
    expect(preview.searchParams.get('live')).toBe('none');
    expect(result.json.review).toEqual(review);
    expect(mocks.createContentVersion).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'marketing-page' }),
      expect.objectContaining({ key: 'home', author: 'agent:summer' })
    );
  });

  it('maps validation failures to 422 with every error', async () => {
    const { ContentValidationError } = await import(
      '@/lib/content-records/store.server'
    );
    mocks.publishContentVersion.mockRejectedValue(
      new ContentValidationError(['sections[0]: bad'])
    );
    expect(
      await call('POST', {
        action: 'publish',
        versionId: VERSION_ID,
        ...publication,
      })
    ).toEqual({
      status: 422,
      json: { ok: false, errors: ['sections[0]: bad'] },
    });
  });

  it('publishes and rolls back through the store with the actor and reason', async () => {
    await call('POST', {
      action: 'publish',
      versionId: VERSION_ID,
      reason: 'ship',
      ...publication,
    });
    expect(mocks.publishContentVersion).toHaveBeenCalledWith(
      expect.anything(),
      {
        key: 'home',
        versionId: VERSION_ID,
        actor: 'agent:summer',
        reason: 'ship',
        ...publication,
      }
    );
    const rolled = await call('POST', {
      action: 'rollback',
      reason: 'oops',
      ...publication,
    });
    expect(rolled).toMatchObject({
      status: 200,
      json: { action: 'rollback', delivery: 'unverified' },
    });
  });

  it('maps conflicts to 409 and rejects malformed requests', async () => {
    const { ContentConflictError } = await import(
      '@/lib/content-records/store.server'
    );
    mocks.rollbackContent.mockRejectedValue(
      new ContentConflictError('nothing to roll back to')
    );
    expect(
      (await call('POST', { action: 'rollback', ...publication })).status
    ).toBe(409);
    expect(
      (await call('POST', { action: 'publish', versionId: 'nope' })).status
    ).toBe(400);
    expect((await call('POST', { action: 'delete' })).status).toBe(400);
  });

  it('forwards an exact decision to server authentication and rejects reviewer spoofing', async () => {
    const input = {
      action: 'approve',
      versionId: VERSION_ID,
      decisionId: publication.approvalId,
      reviewDigest: review.reviewDigest,
      expectedLiveVersionId: null,
    };
    mocks.approveContentVersion.mockResolvedValue({
      id: publication.approvalId,
      identity: review,
    });
    expect((await call('POST', input)).status).toBe(201);
    expect(mocks.approveContentVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        versionId: VERSION_ID,
        reviewDigest: review.reviewDigest,
      }),
      expect.any(Request)
    );
    expect((await call('POST', { ...input, reviewer: 'founder' })).status).toBe(
      400
    );
    const { ContentAuthorizationError } = await import(
      '@/lib/content-records/store.server'
    );
    mocks.approveContentVersion.mockRejectedValue(
      new ContentAuthorizationError(403, 'Founder session required')
    );
    expect((await call('POST', input)).status).toBe(403);
  });

  it('distinguishes committed pending readback from uncertain database outcome', async () => {
    mocks.publishContentVersion.mockResolvedValue({
      ...move('publish'),
      cacheInvalidation: 'uncertain',
    });
    expect(
      (
        await call('POST', {
          action: 'publish',
          versionId: VERSION_ID,
          ...publication,
        })
      ).status
    ).toBe(202);
    const { ContentPublicationUncertainError } = await import(
      '@/lib/content-records/store.server'
    );
    mocks.publishContentVersion.mockRejectedValue(
      new ContentPublicationUncertainError(publication.operationId)
    );
    expect(
      await call('POST', {
        action: 'publish',
        versionId: VERSION_ID,
        ...publication,
      })
    ).toEqual({
      status: 503,
      json: { state: 'uncertain', operationId: publication.operationId },
    });
  });

  it('requires an explicit expected pointer and preserves a stored draft without a bound preview', async () => {
    expect(
      (await call('POST', { action: 'publish', versionId: VERSION_ID })).status
    ).toBe(400);
    mocks.createContentVersion.mockResolvedValue({
      id: VERSION_ID,
      version: 3,
      data: {},
    });
    mocks.getContentReviewIdentity.mockResolvedValue(null);
    expect(
      await call('POST', { action: 'draft', data: await validSpec() })
    ).toMatchObject({
      status: 201,
      json: { version: { id: VERSION_ID }, review: null, previewUrl: null },
    });
  });
});
