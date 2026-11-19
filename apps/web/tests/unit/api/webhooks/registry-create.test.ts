import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, runtime } from '@/app/api/webhooks/registry-create/route';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  acquire: vi.fn(),
  clear: vi.fn(),
  capture: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockEnv = vi.hoisted(() => ({
  REGISTRY_GITHUB_WEBHOOK_SECRET: 'github-secret' as string | undefined,
  REGISTRY_VERCEL_WEBHOOK_SECRET: 'vercel-secret' as string | undefined,
  REGISTRY_DISPATCH_TOKEN: 'registry-ci-token' as string | undefined,
  GH_DISPATCH_TOKEN: 'jovie-token-must-not-be-used',
  VERCEL_GIT_REPO_OWNER: 'untrusted-owner',
  VERCEL_GIT_REPO_SLUG: 'untrusted-repo',
}));

vi.mock('@/lib/env-server', () => ({ env: mockEnv }));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mocks.capture,
  captureError: mocks.capture,
}));
vi.mock('@/lib/http/server-fetch', async () => ({
  ...(await vi.importActual<typeof import('@/lib/http/server-fetch')>(
    '@/lib/http/server-fetch'
  )),
  serverFetch: mocks.fetch,
}));
vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  acquireRecentDispatch: mocks.acquire,
  clearRecentDispatch: mocks.clear,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

const NOW = 1_790_000_000_000;
const DELIVERY_ID = '12345678-90ab-cdef-1234-567890abcdef';
const URL = 'https://example.com/api/webhooks/registry-create';
const DISPATCH_URL = 'https://api.github.com/repos/JovieInc/ci/dispatches';

function githubPayload(action = 'created') {
  return {
    action,
    repository: { full_name: 'JovieInc/new-thing', private: true },
    sender: { email: 'private@example.com', token: 'private-sender-data' },
  };
}

function vercelPayload(type = 'project.created') {
  return {
    id: 'vercel-event-123',
    createdAt: NOW,
    type,
    payload: {
      project: { name: 'new-thing', id: 'private-project-id' },
      user: { email: 'private@example.com' },
    },
  };
}

function signedRequest(
  provider: 'github' | 'vercel',
  payload: unknown,
  headers: Record<string, string> = {},
  rawBody = JSON.stringify(payload)
): NextRequest {
  const signature = createHmac(
    provider === 'github' ? 'sha256' : 'sha1',
    `${provider}-secret`
  )
    .update(rawBody)
    .digest('hex');
  return new NextRequest(URL, {
    method: 'POST',
    body: rawBody,
    headers: {
      'Content-Type': 'application/json',
      ...(provider === 'github'
        ? {
            'x-hub-signature-256': `sha256=${signature}`,
            'x-github-event': 'repository',
            'x-github-delivery': DELIVERY_ID,
          }
        : { 'x-vercel-signature': signature }),
      ...headers,
    },
  });
}

async function expectResponse(
  request: NextRequest,
  status: number,
  body: Record<string, unknown>,
  fetchCount = 0
) {
  const response = await POST(request);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.fetch).toHaveBeenCalledTimes(fetchCount);
}

describe('POST /api/webhooks/registry-create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockEnv.REGISTRY_GITHUB_WEBHOOK_SECRET = 'github-secret';
    mockEnv.REGISTRY_VERCEL_WEBHOOK_SECRET = 'vercel-secret';
    mockEnv.REGISTRY_DISPATCH_TOKEN = 'registry-ci-token';
    const locks = new Set<string>();
    mocks.acquire.mockImplementation(async (scope: string, id: string) => {
      const key = `${scope}:${id}`;
      if (locks.has(key)) return { acquired: false, reason: 'duplicate' };
      locks.add(key);
      return { acquired: true, reason: 'acquired' };
    });
    mocks.clear.mockImplementation(async (scope: string, id: string) => {
      locks.delete(`${scope}:${id}`);
    });
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches exactly the GitHub kind and name to the fixed company repo', async () => {
    expect(runtime).toBe('nodejs');
    await expectResponse(
      signedRequest('github', githubPayload()),
      202,
      { ok: true, dispatched: true },
      1
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      DISPATCH_URL,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer registry-ci-token',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'resource-created',
          client_payload: { kind: 'github-repo', name: 'JovieInc/new-thing' },
        }),
        timeoutMs: 4500,
        redirect: 'error',
      })
    );
    expect(mocks.fetch.mock.calls[0]?.[1]).not.toHaveProperty('retry');
    expect(mocks.acquire).toHaveBeenCalledWith(
      'registry-create-github',
      DELIVERY_ID,
      86400
    );
    const log = JSON.stringify([mocks.info.mock.calls, mocks.warn.mock.calls]);
    expect(log).not.toContain('private@example.com');
    expect(log).not.toContain('private-sender-data');
    expect(log).not.toContain('github-secret');
    expect(log).not.toContain('registry-ci-token');
    expect(mocks.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        provider: 'github',
        kind: 'github-repo',
        name: 'JovieInc/new-thing',
        deliveryId: DELIVERY_ID,
        outcome: 'dispatched',
      })
    );
  });

  it.each(['project.created', 'project.renamed'])(
    'dispatches only the Vercel kind and name for %s',
    async type => {
      await expectResponse(
        signedRequest('vercel', vercelPayload(type)),
        202,
        { ok: true, dispatched: true },
        1
      );
      expect(mocks.fetch).toHaveBeenCalledWith(
        DISPATCH_URL,
        expect.objectContaining({
          body: JSON.stringify({
            event_type: 'resource-created',
            client_payload: { kind: 'vercel-project', name: 'new-thing' },
          }),
        })
      );
      expect(mocks.acquire).toHaveBeenCalledWith(
        'registry-create-vercel',
        'vercel-event-123',
        86400
      );
    }
  );

  it.each(['renamed', 'transferred'])(
    'dispatches GitHub repository.%s',
    async action => {
      await expectResponse(
        signedRequest('github', githubPayload(action)),
        202,
        { ok: true, dispatched: true },
        1
      );
    }
  );

  it('rejects unsigned requests before parsing', async () => {
    await expectResponse(
      new NextRequest(URL, { method: 'POST', body: 'not json' }),
      401,
      { error: 'unsigned' }
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it('rejects both provider headers, including empty ones', async () => {
    await expectResponse(
      signedRequest('github', githubPayload(), { 'x-vercel-signature': '' }),
      400,
      { error: 'ambiguous_provider' }
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it.each(['github', 'vercel'] as const)(
    'rejects bad %s signatures before parsing or dedupe',
    async provider => {
      const header =
        provider === 'github' ? 'x-hub-signature-256' : 'x-vercel-signature';
      await expectResponse(
        signedRequest(provider, {}, { [header]: 'bad-signature' }, 'not json'),
        401,
        { error: 'bad_signature' }
      );
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it('treats an empty GitHub signature header as a bad signature, not unsigned', async () => {
    await expectResponse(
      signedRequest('github', githubPayload(), { 'x-hub-signature-256': '' }),
      401,
      { error: 'bad_signature' }
    );
  });

  it.each(['github', 'vercel'] as const)(
    'deduplicates a repeated %s delivery',
    async provider => {
      const payload = provider === 'github' ? githubPayload() : vercelPayload();
      await expectResponse(
        signedRequest(provider, payload),
        202,
        { ok: true, dispatched: true },
        1
      );
      await expectResponse(
        signedRequest(provider, payload),
        200,
        { ok: true, duplicate: true },
        1
      );
    }
  );

  it.each(['github', 'vercel'] as const)(
    'fails closed when the %s dedupe backend is unavailable',
    async provider => {
      mocks.acquire.mockResolvedValue({
        acquired: false,
        reason: 'backend_unavailable',
      });
      await expectResponse(
        signedRequest(
          provider,
          provider === 'github' ? githubPayload() : vercelPayload()
        ),
        503,
        { error: 'dedupe_unavailable' }
      );
      expect(mocks.capture).toHaveBeenCalledOnce();
      expect(mocks.clear).not.toHaveBeenCalled();
    }
  );

  it.each([null, '', 'not-a-uuid', 'a'.repeat(65), '1234567'])(
    'requires a valid GitHub delivery id (%j)',
    async id => {
      const request = signedRequest('github', githubPayload());
      if (id === null) request.headers.delete('x-github-delivery');
      else request.headers.set('x-github-delivery', id);
      await expectResponse(request, 400, { error: 'invalid_delivery' });
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, '', 123])(
    'requires a Vercel event id (%j)',
    async id => {
      await expectResponse(
        signedRequest('vercel', { ...vercelPayload(), id }),
        400,
        { error: 'invalid_delivery' }
      );
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, '1790000000000', NOW - 300001, NOW + 300001])(
    'rejects stale or invalid Vercel createdAt (%j)',
    async createdAt => {
      await expectResponse(
        signedRequest('vercel', { ...vercelPayload(), createdAt }),
        401,
        { error: 'stale' }
      );
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it.each([-300000, 300000])(
    'accepts Vercel freshness boundary %i ms',
    async offset => {
      await expectResponse(
        signedRequest('vercel', {
          ...vercelPayload(),
          createdAt: NOW + offset,
        }),
        202,
        { ok: true, dispatched: true },
        1
      );
    }
  );

  it.each(['github', 'vercel'] as const)(
    'fails closed when the %s secret is unset',
    async provider => {
      if (provider === 'github')
        mockEnv.REGISTRY_GITHUB_WEBHOOK_SECRET = undefined;
      else mockEnv.REGISTRY_VERCEL_WEBHOOK_SECRET = undefined;
      await expectResponse(
        signedRequest(
          provider,
          provider === 'github' ? githubPayload() : vercelPayload()
        ),
        503,
        { error: 'not_configured' }
      );
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it.each(['github', 'vercel'] as const)(
    'fails closed without the dispatch token after a valid %s signature',
    async provider => {
      mockEnv.REGISTRY_DISPATCH_TOKEN = undefined;
      await expectResponse(
        signedRequest(
          provider,
          provider === 'github' ? githubPayload() : vercelPayload()
        ),
        503,
        { error: 'not_configured' }
      );
      expect(mocks.warn).toHaveBeenCalled();
      expect(mocks.acquire).not.toHaveBeenCalled();
    }
  );

  it('checks the signature before reporting missing dispatch configuration', async () => {
    mockEnv.REGISTRY_DISPATCH_TOKEN = undefined;
    await expectResponse(
      signedRequest('github', githubPayload(), {
        'x-hub-signature-256': 'bad',
      }),
      401,
      { error: 'bad_signature' }
    );
  });

  it('does not require the other provider secret', async () => {
    mockEnv.REGISTRY_VERCEL_WEBHOOK_SECRET = undefined;
    await expectResponse(
      signedRequest('github', githubPayload()),
      202,
      { ok: true, dispatched: true },
      1
    );
  });

  it.each([
    ['repository', 'deleted'],
    ['push', 'created'],
  ])('ignores GitHub %s / %s', async (event, action) => {
    await expectResponse(
      signedRequest('github', githubPayload(action), {
        'x-github-event': event,
      }),
      202,
      { ok: true, ignored: true }
    );
  });

  it('ignores Vercel deployment.created', async () => {
    await expectResponse(
      signedRequest('vercel', vercelPayload('deployment.created')),
      202,
      { ok: true, ignored: true }
    );
  });

  it.each(['github', 'vercel'] as const)(
    'ignores invalid %s resource names',
    async provider => {
      const payload =
        provider === 'github'
          ? {
              ...githubPayload(),
              repository: { full_name: 'org/repo/invalid' },
            }
          : {
              ...vercelPayload(),
              payload: { project: { name: 'project/invalid' } },
            };
      await expectResponse(signedRequest(provider, payload), 202, {
        ok: true,
        ignored: true,
      });
    }
  );

  it('acknowledges a signed GitHub ping without dispatching', async () => {
    await expectResponse(
      signedRequest('github', { zen: 'test' }, { 'x-github-event': 'ping' }),
      200,
      { ok: true, pong: true }
    );
  });

  it('does not acknowledge an unsigned ping', async () => {
    const request = signedRequest('github', {}, { 'x-github-event': 'ping' });
    request.headers.delete('x-hub-signature-256');
    await expectResponse(request, 401, { error: 'unsigned' });
  });

  it.each(['github', 'vercel'] as const)(
    'releases a %s lock on 422 and allows redelivery',
    async provider => {
      const payload = provider === 'github' ? githubPayload() : vercelPayload();
      mocks.fetch.mockResolvedValueOnce(
        new Response('rejected', { status: 422 })
      );
      await expectResponse(
        signedRequest(provider, payload),
        502,
        { error: 'dispatch_failed' },
        1
      );
      expect(mocks.clear).toHaveBeenCalledWith(
        `registry-create-${provider}`,
        provider === 'github' ? DELIVERY_ID : 'vercel-event-123'
      );
      await expectResponse(
        signedRequest(provider, payload),
        202,
        { ok: true, dispatched: true },
        2
      );
    }
  );

  it('keeps the lock on an ambiguous timeout and suppresses redelivery', async () => {
    mocks.fetch.mockRejectedValueOnce(
      new ServerFetchTimeoutError('timed out', 4500, 'Registry dispatch')
    );
    await expectResponse(
      signedRequest('github', githubPayload()),
      504,
      { error: 'dispatch_timeout' },
      1
    );
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledOnce();
    await expectResponse(
      signedRequest('github', githubPayload()),
      200,
      { ok: true, duplicate: true },
      1
    );
  });

  it('clears a lock after a transport failure without logging the thrown message', async () => {
    mocks.fetch.mockRejectedValueOnce(
      new Error('private-sender-data registry-ci-token')
    );
    await expectResponse(
      signedRequest('github', githubPayload()),
      500,
      { error: 'processing_failed' },
      1
    );
    expect(mocks.clear).toHaveBeenCalledWith(
      'registry-create-github',
      DELIVERY_ID
    );
    expect(mocks.capture.mock.calls[0]?.[1].message).toBe(
      'Webhook processing failed'
    );
  });

  it('returns 400 for signed malformed JSON without logging body excerpts', async () => {
    await expectResponse(
      signedRequest('github', {}, {}, '{private-sender-data'),
      400,
      { error: 'invalid_json' }
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(
      'private-sender-data'
    );
  });

  it.each([
    {},
    { 'content-length': '1' },
    { 'content-length': String(256 * 1024 + 1) },
  ])('rejects bodies larger than 256 KiB with headers %j', async headers => {
    await expectResponse(
      signedRequest('github', {}, headers, 'a'.repeat(256 * 1024 + 1)),
      413,
      { error: 'body_too_large' }
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes rather than characters for the body cap', async () => {
    await expectResponse(
      signedRequest('github', {}, {}, 'é'.repeat(128 * 1024 + 1)),
      413,
      { error: 'body_too_large' }
    );
  });

  it('accepts exactly 256 KiB and verifies the original whitespace', async () => {
    const body = JSON.stringify(githubPayload());
    const rawBody = body + ' '.repeat(256 * 1024 - Buffer.byteLength(body));
    await expectResponse(
      signedRequest('github', {}, {}, rawBody),
      202,
      { ok: true, dispatched: true },
      1
    );
  });
});
