import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  displayDeviceProof,
  parseDisplayDevices,
} from '@/lib/ovie/display/session';

const SECRET = 's'.repeat(40);
const KEY = 'k'.repeat(40);
const state = vi.hoisted(() => ({
  config: { devices: [] as unknown[], key: '' },
  claimed: new Set<string>(),
  attempts: 0,
  limit: 10,
  redisUp: true,
}));
vi.mock('@/lib/ovie/display/server', () => ({
  displayConfig: () => state.config,
  allowDisplayExchangeAttempt: async () =>
    state.redisUp && ++state.attempts <= state.limit,
  claimDisplayProof: async (device: string, ts: number) => {
    if (!state.redisUp) return false;
    const key = `${device}:${ts}`;
    if (state.claimed.has(key)) return false;
    state.claimed.add(key);
    return true;
  },
}));

import * as route from './route';

const post = (body: unknown) =>
  route.POST(
    new NextRequest('https://example.test/api/ovie/display/session', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
const proofFor = (t: number, secret = SECRET) => ({
  device: 'air-office',
  ts: t,
  proof: displayDeviceProof(secret, 'air-office', t),
});
const now = () => Math.floor(Date.now() / 1000);

describe('display session exchange', () => {
  beforeEach(() => {
    state.config = {
      devices: parseDisplayDevices(
        JSON.stringify([{ id: 'air-office', secret: SECRET }])
      ),
      key: KEY,
    };
    state.claimed.clear();
    state.attempts = 0;
    state.limit = 10;
    state.redisUp = true;
  });

  it('a valid proof sets a HttpOnly Secure SameSite=Strict cookie and returns no token in the body', async () => {
    const response = await post(proofFor(now()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ovie_display=[\w-]+\.[0-9a-f]{64};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('exports POST only: there is no GET, so a proof cannot ride a URL', () => {
    expect(Object.keys(route).filter(key => /^[A-Z]+$/.test(key))).toEqual([
      'POST',
    ]);
  });

  it('a proof is single use: the replay is denied (and so is a replay of a stolen one)', async () => {
    const body = proofFor(now());
    expect((await post(body)).status).toBe(200);
    const replay = await post(body);
    expect(replay.status).toBe(401);
    expect(replay.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed when the replay store is unavailable', async () => {
    state.redisUp = false;
    const response = await post(proofFor(now()));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('is rate limited: attempts past the cap are denied even with a valid proof', async () => {
    state.limit = 2;
    expect((await post({ device: 'x', ts: 1, proof: 'bad' })).status).toBe(401);
    expect((await post({ device: 'x', ts: 1, proof: 'bad' })).status).toBe(401);
    expect((await post(proofFor(now()))).status).toBe(401);
  });

  it('garbage does not burn a real proof', async () => {
    const t = now();
    await post({ device: 'air-office', ts: t, proof: 'f'.repeat(64) });
    expect((await post(proofFor(t))).status).toBe(200);
  });

  it('every failure is the same 401 body with no cookie', async () => {
    const t = now();
    const bodies: string[] = [];
    for (const attempt of [
      { device: 'air-office', ts: t, proof: 'f'.repeat(64) },
      { ...proofFor(t), device: 'nobody' },
      proofFor(t - 3600),
      proofFor(t + 60),
      'not json',
      {},
    ]) {
      const response = await post(attempt);
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('is closed when nothing is configured or the key is short', async () => {
    state.config = { devices: [], key: '' };
    expect((await post(proofFor(now()))).status).toBe(401);
    state.config = { ...state.config, key: 'short' };
    expect((await post(proofFor(now()))).status).toBe(401);
  });
});
