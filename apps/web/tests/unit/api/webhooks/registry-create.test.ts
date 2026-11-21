import './registry-create.fixtures';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { runtime } from '@/app/api/webhooks/registry-create/route';
import {
  DELIVERY_ID,
  DISPATCH_URL,
  expectResponse,
  githubPayload,
  mockEnv,
  mocks,
  setupRegistryCreateTests,
  signedRequest,
  URL,
  vercelPayload,
} from './registry-create.fixtures';

describe('POST /api/webhooks/registry-create', () => {
  setupRegistryCreateTests();

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
});
