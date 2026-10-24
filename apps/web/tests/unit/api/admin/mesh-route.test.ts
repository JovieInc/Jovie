import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  loadMeshRead: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.access,
}));
vi.mock('@/lib/ovie/mesh/read.server', () => ({
  loadMeshRead: mocks.loadMeshRead,
}));

import { GET } from '@/app/api/admin/mesh/route';

const READ_PAYLOAD = {
  schema: 'jovie.mesh-read/v1',
  mailboxSource: 'ok',
  watcherSource: 'ok',
  agents: [
    {
      id: 'summer',
      label: 'Summer',
      receiveMode: 'direct',
      waitingOnTim: null,
      status: 'live',
      lastSentAt: '2026-10-23T18:00:00.000Z',
      lastReceivedAt: '2026-10-23T18:30:00.000Z',
      recentMessages: [],
      gaps: [],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.loadMeshRead.mockResolvedValue(READ_PAYLOAD);
});

describe('GET /api/admin/mesh', () => {
  it('enforces the Ovie admin gate', async () => {
    mocks.access.mockResolvedValue(new Response('denied', { status: 403 }));
    const response = await GET(new Request('https://jov.ie/api/admin/mesh'));
    expect(response.status).toBe(403);
  });

  it('returns the read payload with no-store headers', async () => {
    const response = await GET(new Request('https://jov.ie/api/admin/mesh'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(READ_PAYLOAD);
    expect(mocks.loadMeshRead).toHaveBeenCalledTimes(1);
  });

  it('maps read crashes to a 500 without leaking internals', async () => {
    mocks.loadMeshRead.mockRejectedValue(new Error('boom'));
    const response = await GET(new Request('https://jov.ie/api/admin/mesh'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Mesh is unavailable right now.',
    });
  });

  it('serializes without token, hash, or secret fields', async () => {
    const response = await GET(new Request('https://jov.ie/api/admin/mesh'));
    const body = (await response.json()) as Record<string, unknown>;
    const forbidden = /token|hash|secret|credential|password/i;
    const walk = (value: unknown): string[] => {
      if (typeof value === 'string' || value === null) return [];
      if (Array.isArray(value)) return value.flatMap(walk);
      if (typeof value === 'object') {
        return Object.entries(value).flatMap(([entryKey, entryValue]) =>
          forbidden.test(entryKey) ? [entryKey] : walk(entryValue)
        );
      }
      return [];
    };
    expect(walk(body)).toEqual([]);
  });
});
