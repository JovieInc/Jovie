import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthorizeHud = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());
const mockReadCached = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockCreateLiveReaders = vi.hoisted(() => vi.fn());
const mockDefaultLiveIo = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: mockAuthorizeHud,
}));

vi.mock('@/lib/ovie/shipping-state', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/ovie/shipping-state')>();
  return {
    ...actual,
    publishShippingState: mockPublish,
  };
});

vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  publishConfiguredShippingState: mockPublish,
  readCachedConfiguredShippingState: mockReadCached,
}));

vi.mock('@/lib/ovie/shipping-state/live', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/ovie/shipping-state/live')>();
  return {
    ...actual,
    createLiveShippingStateReaders: mockCreateLiveReaders,
    defaultLiveIo: mockDefaultLiveIo,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mockLoggerError },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_TOKEN: 'token',
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

describe('GET /api/hud/shipping-state', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateLiveReaders.mockReturnValue({});
    mockDefaultLiveIo.mockReturnValue({
      readFile: mockReadFile,
      fetch: vi.fn(),
    });
    mockReadCached.mockReturnValue({
      schema: 'ovie.shipping-state.v1',
      state: 'fresh',
      publishing: true,
      latencyMs: 12,
    });
    mockPublish.mockResolvedValue({ schema: 'ovie.shipping-state.v1' });
  });

  it('returns 401 when HUD auth fails', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    const { GET } = await import('@/app/api/hud/shipping-state/route');
    const response = await GET(
      new NextRequest('http://localhost/api/hud/shipping-state')
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
      state: 'unauthorized',
    });
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockReadCached).not.toHaveBeenCalled();
  });

  it('rejects path and actuation query parameters without reading files or dispatching', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    const { GET } = await import('@/app/api/hud/shipping-state/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/hud/shipping-state?path=/etc/passwd&action=dispatch&cmd=retry&file=/var/log/syslog'
      )
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      state: 'error',
    });
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockReadCached).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('returns the local projection without waiting for reconciliation', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    mockPublish.mockReturnValue(new Promise(() => {}));
    const { GET } = await import('@/app/api/hud/shipping-state/route');
    const response = await GET(
      new NextRequest('http://localhost/api/hud/shipping-state')
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      schema: 'ovie.shipping-state.v1',
      publishing: true,
    });
    expect(mockReadCached).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it('does not export actuation methods', async () => {
    const route = await import('@/app/api/hud/shipping-state/route');
    expect('POST' in route).toBe(false);
    expect('PUT' in route).toBe(false);
    expect('DELETE' in route).toBe(false);
    expect('PATCH' in route).toBe(false);
  });
});
