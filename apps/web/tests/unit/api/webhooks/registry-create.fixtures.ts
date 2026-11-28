import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/registry-create/route';

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

export function setupRegistryCreateTests() {
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
}

export {
  DELIVERY_ID,
  DISPATCH_URL,
  expectResponse,
  githubPayload,
  mockEnv,
  mocks,
  NOW,
  signedRequest,
  URL,
  vercelPayload,
};
