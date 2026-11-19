import { describe, expect, it } from 'vitest';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';
import {
  DELIVERY_ID,
  expectResponse,
  githubPayload,
  mocks,
  NOW,
  setupRegistryCreateTests,
  signedRequest,
  vercelPayload,
} from './registry-create.fixtures';

describe('POST /api/webhooks/registry-create', () => {
  setupRegistryCreateTests();

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
