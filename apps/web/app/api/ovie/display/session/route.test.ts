import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  displayDeviceProof,
  parseDisplayDevices,
} from '@/lib/ovie/display/session';

const SECRET = 's'.repeat(40);
const KEY = 'k'.repeat(40);
const config = vi.hoisted(() => ({
  value: { devices: [] as unknown[], key: '' },
}));
vi.mock('@/lib/ovie/display/server', () => ({
  displayConfig: () => config.value,
}));

import { GET, POST } from './route';

const ts = () => Math.floor(Date.now() / 1000);
const url = (device: string, t: number, proof: string) =>
  `https://example.test/api/ovie/display/session?device=${device}&ts=${t}&proof=${proof}`;

describe('display session exchange', () => {
  beforeEach(() => {
    config.value = {
      devices: parseDisplayDevices(
        JSON.stringify([{ id: 'air-office', secret: SECRET }])
      ),
      key: KEY,
    };
  });
  it('a valid proof sets a HttpOnly Secure SameSite=Strict cookie and redirects to /display', async () => {
    const t = ts();
    const response = GET(
      new NextRequest(
        url('air-office', t, displayDeviceProof(SECRET, 'air-office', t))
      )
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://example.test/display'
    );
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ovie_display=[\w-]+\.[0-9a-f]{64};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('POST works the same and returns no token in the body', async () => {
    const t = ts();
    const response = await POST(
      new NextRequest('https://example.test/api/ovie/display/session', {
        method: 'POST',
        body: JSON.stringify({
          device: 'air-office',
          ts: t,
          proof: displayDeviceProof(SECRET, 'air-office', t),
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toMatch(/^ovie_display=/);
  });
  it('every failure is the same 401 with no cookie', async () => {
    const t = ts();
    const good = displayDeviceProof(SECRET, 'air-office', t);
    const cases = [
      GET(new NextRequest(url('air-office', t, 'f'.repeat(64)))),
      GET(new NextRequest(url('nobody', t, good))),
      GET(
        new NextRequest(
          url(
            'air-office',
            t - 3600,
            displayDeviceProof(SECRET, 'air-office', t - 3600)
          )
        )
      ),
      GET(new NextRequest('https://example.test/api/ovie/display/session')),
      await POST(
        new NextRequest('https://example.test/api/ovie/display/session', {
          method: 'POST',
          body: 'not json',
        })
      ),
    ];
    const bodies = [];
    for (const response of cases) {
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
  });
  it('is closed when nothing is configured', () => {
    config.value = { devices: [], key: '' };
    const t = ts();
    const response = GET(
      new NextRequest(
        url('air-office', t, displayDeviceProof(SECRET, 'air-office', t))
      )
    );
    expect(response.status).toBe(401);
  });
  it('is closed when the session key is missing or short', () => {
    config.value = { ...config.value, key: 'short' };
    const t = ts();
    expect(
      GET(
        new NextRequest(
          url('air-office', t, displayDeviceProof(SECRET, 'air-office', t))
        )
      ).status
    ).toBe(401);
  });
});
