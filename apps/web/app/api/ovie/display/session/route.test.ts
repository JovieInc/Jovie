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
  claimed: new Map<string, { attempt: string; token: string }>(),
  attempts: 0,
  limit: 10,
  redisUp: true,
  hints: [] as unknown[],
}));
vi.mock('@/lib/ovie/display/server', () => ({
  displayConfig: () => state.config,
  clientAddress: () => '203.0.113.7',
  isDisplayAttemptId: (value: unknown) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    ),
  allowDisplayExchangeAttempt: async (input: { deviceHint: unknown }) => {
    state.hints.push(input.deviceHint);
    if (!state.redisUp) return 'unavailable';
    return ++state.attempts <= state.limit ? 'ok' : 'denied';
  },
  claimDisplayProof: async (
    device: string,
    ts: number,
    attempt: string,
    token: string
  ) => {
    if (!state.redisUp) return { status: 'unavailable' };
    const key = `${device}:${ts}`;
    const existing = state.claimed.get(key);
    if (!existing) {
      state.claimed.set(key, { attempt, token });
      return { status: 'ok', token };
    }
    if (existing.attempt === attempt)
      return { status: 'ok', token: existing.token };
    return { status: 'denied' };
  },
}));

import * as route from './route';

const post = (
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' }
) =>
  route.POST(
    new NextRequest('https://example.test/api/ovie/display/session', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
const ATTEMPT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const proofFor = (t: number, secret = SECRET) => ({
  device: 'air-office',
  ts: t,
  proof: displayDeviceProof(secret, 'air-office', t),
  attempt: ATTEMPT,
});
const cookieValue = (response: Response) =>
  response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
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
    state.hints = [];
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

  it('the same attempt redeems the claimed session after a dropped response', async () => {
    const body = proofFor(now());
    const first = await post(body);
    const retry = await post(body);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(cookieValue(retry)).toBe(cookieValue(first));
    expect(cookieValue(retry)).toMatch(/^ovie_display=/);
  });

  it('a different attempt cannot redeem a proof that was already claimed', async () => {
    const body = proofFor(now());
    expect((await post(body)).status).toBe(200);
    const stolen = await post({
      ...body,
      attempt: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(stolen.status).toBe(401);
    expect(stolen.headers.get('set-cookie')).toBeNull();
  });

  it('a valid proof without an attempt id is denied and does not spend the proof', async () => {
    const body = proofFor(now());
    const withoutAttempt = {
      device: body.device,
      ts: body.ts,
      proof: body.proof,
    };
    expect((await post(withoutAttempt)).status).toBe(401);
    expect((await post(body)).status).toBe(200);
  });

  it('a store outage is a retryable 503 with no cookie, and the proof is not spent', async () => {
    const body = proofFor(now());
    state.redisUp = false;
    const down = await post(body);
    expect(down.status).toBe(503);
    expect(down.headers.get('set-cookie')).toBeNull();
    state.redisUp = true;
    expect((await post(body)).status).toBe(200);
  });

  it('over the per-address-and-device cap is a 429 even with a valid proof', async () => {
    state.limit = 2;
    expect((await post({ device: 'x', ts: 1, proof: 'bad' })).status).toBe(401);
    expect((await post({ device: 'x', ts: 1, proof: 'bad' })).status).toBe(401);
    const limited = await post(proofFor(now()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('set-cookie')).toBeNull();
  });

  it('rate limits by the claimed device id, so the key is per address and device', async () => {
    await post(proofFor(now()));
    await post({ device: 7, ts: 1, proof: 'x' });
    expect(state.hints).toEqual(['air-office', 7]);
  });

  it('requires a JSON content type and a same-origin Origin', async () => {
    const body = proofFor(now());
    expect((await post(body, { 'content-type': 'text/plain' })).status).toBe(
      415
    );
    expect((await post(body, {})).status).toBe(415);
    expect(
      (
        await post(body, {
          'content-type': 'application/json',
          origin: 'https://evil.test',
        })
      ).status
    ).toBe(403);
    expect(
      (
        await post(body, {
          'content-type': 'application/json',
          origin: 'https://example.test',
        })
      ).status
    ).toBe(200);
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
