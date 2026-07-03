import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthorizeHud = vi.hoisted(() => vi.fn());
const mockReadWhatShippedFromDisk = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: mockAuthorizeHud,
}));

vi.mock('@/lib/hud/what-shipped', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/hud/what-shipped')>();
  return {
    ...actual,
    readWhatShippedFromDisk: mockReadWhatShippedFromDisk,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

describe('GET /api/ops/what-shipped', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 when HUD auth fails', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: false, reason: 'unauthorized' });

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET(
      new Request('http://localhost:3000/api/ops/what-shipped')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockReadWhatShippedFromDisk).not.toHaveBeenCalled();
  });

  it('returns the disk payload for authorized admin requests', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    mockReadWhatShippedFromDisk.mockResolvedValue({
      generatedAt: '2026-07-03T10:05:34.770172+00:00',
      items: [
        {
          number: 12875,
          title: 'Updated entity chip thumbnails to a new design',
          merged_at: '2026-07-03T09:44:10Z',
          url: 'https://github.com/JovieInc/Jovie/pull/12875',
        },
      ],
      available: true,
    });

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET(
      new Request('http://localhost:3000/api/ops/what-shipped')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      generatedAt: '2026-07-03T10:05:34.770172+00:00',
      items: [
        {
          number: 12875,
          title: 'Updated entity chip thumbnails to a new design',
          merged_at: '2026-07-03T09:44:10Z',
          url: 'https://github.com/JovieInc/Jovie/pull/12875',
        },
      ],
      available: true,
    });
  });

  it('returns an empty payload when disk read throws', async () => {
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    mockReadWhatShippedFromDisk.mockRejectedValue(
      new Error('disk read failed')
    );

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET(
      new Request('http://localhost:3000/api/ops/what-shipped')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      generatedAt: null,
      items: [],
      available: false,
    });
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
