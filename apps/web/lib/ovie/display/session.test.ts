import { describe, expect, it } from 'vitest';
import {
  DISPLAY_PROOF_SKEW_SECONDS,
  DISPLAY_SESSION_TTL_SECONDS,
  displayDeviceProof,
  mintDisplaySession,
  parseDisplayDevices,
  readCookie,
  verifyDeviceProof,
  verifyDisplaySession,
} from './session';

const SECRET = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const KEY = 'k'.repeat(40);
const NOW = 1_800_000_000_000;
const ts = Math.floor(NOW / 1000);
const devices = parseDisplayDevices(
  JSON.stringify([{ id: 'air-office', secret: SECRET, previousSecret: OLD }])
);
const device = devices[0]!;

describe('parseDisplayDevices', () => {
  it('drops malformed entries instead of widening access', () => {
    expect(parseDisplayDevices(undefined)).toEqual([]);
    expect(parseDisplayDevices('not json')).toEqual([]);
    expect(parseDisplayDevices('{}')).toEqual([]);
    const parsed = parseDisplayDevices(
      JSON.stringify([
        { id: 'Bad Id', secret: SECRET },
        { id: 'short', secret: 'tiny' },
        { id: 'dup-1', secret: SECRET },
        { id: 'dup-1', secret: OLD },
        { id: 'bad-prev', secret: SECRET, previousSecret: 'x' },
      ])
    );
    expect(parsed.map(item => item.id)).toEqual(['dup-1']);
    expect(parsed[0]?.secrets).toEqual([SECRET]);
  });
});

describe('verifyDeviceProof', () => {
  const proof = (secret: string, t = ts, id = 'air-office') =>
    displayDeviceProof(secret, id, t);
  const verify = (over: Record<string, unknown> = {}) =>
    verifyDeviceProof({
      devices,
      deviceId: 'air-office',
      ts,
      proof: proof(SECRET),
      nowMs: NOW,
      ...over,
    });
  it('accepts the current and the previous secret (rotation window)', () => {
    expect(verify()?.id).toBe('air-office');
    expect(verify({ proof: proof(OLD) })?.id).toBe('air-office');
  });
  it('rejects a wrong secret, a wrong device, and malformed input', () => {
    expect(verify({ proof: proof('c'.repeat(40)) })).toBeNull();
    expect(verify({ deviceId: 'other' })).toBeNull();
    expect(verify({ proof: 5 })).toBeNull();
    expect(verify({ ts: '1' })).toBeNull();
    expect(verify({ ts: ts + 0.5 })).toBeNull();
  });
  it('rejects stale and future proofs beyond the skew', () => {
    const edge = DISPLAY_PROOF_SKEW_SECONDS;
    expect(
      verify({ ts: ts - edge, proof: proof(SECRET, ts - edge) })
    ).not.toBeNull();
    expect(
      verify({ ts: ts - edge - 1, proof: proof(SECRET, ts - edge - 1) })
    ).toBeNull();
    expect(
      verify({ ts: ts + edge + 1, proof: proof(SECRET, ts + edge + 1) })
    ).toBeNull();
  });
  it('a proof for one timestamp cannot be reused for another', () => {
    expect(verify({ ts: ts + 1 })).toBeNull();
  });
  it('rejects a disabled device', () => {
    const off = parseDisplayDevices(
      JSON.stringify([{ id: 'air-office', secret: SECRET, disabled: true }])
    );
    expect(
      verifyDeviceProof({
        devices: off,
        deviceId: 'air-office',
        ts,
        proof: proof(SECRET),
        nowMs: NOW,
      })
    ).toBeNull();
  });
});

describe('display session', () => {
  const minted = mintDisplaySession({ device, key: KEY, nowMs: NOW });
  const verify = (over: Record<string, unknown> = {}) =>
    verifyDisplaySession({
      token: minted.token,
      devices,
      key: KEY,
      nowMs: NOW + 1000,
      ...over,
    });
  it('round-trips for the device and expires after the TTL', () => {
    expect(verify()?.id).toBe('air-office');
    expect(minted.expiresAt).toBe(ts + DISPLAY_SESSION_TTL_SECONDS);
    expect(
      verify({ nowMs: NOW + (DISPLAY_SESSION_TTL_SECONDS - 1) * 1000 })
    ).not.toBeNull();
    expect(
      verify({ nowMs: NOW + DISPLAY_SESSION_TTL_SECONDS * 1000 })
    ).toBeNull();
  });
  it('rejects tampering, a wrong key, a short key, and junk', () => {
    const [body, sig] = minted.token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        s: 'admin',
        d: 'air-office',
        iat: ts,
        exp: ts + 99999,
      })
    ).toString('base64url');
    expect(verify({ token: `${forged}.${sig}` })).toBeNull();
    expect(verify({ token: `${body}.${'0'.repeat(64)}` })).toBeNull();
    expect(verify({ key: 'z'.repeat(40) })).toBeNull();
    expect(verify({ key: 'short' })).toBeNull();
    expect(verify({ token: 'a.b.c' })).toBeNull();
    expect(verify({ token: null })).toBeNull();
  });
  it('is revoked by removing the device, disabling it, or revokedBefore', () => {
    expect(verify({ devices: [] })).toBeNull();
    const disabled = parseDisplayDevices(
      JSON.stringify([{ id: 'air-office', secret: SECRET, disabled: true }])
    );
    expect(verify({ devices: disabled })).toBeNull();
    const revoked = parseDisplayDevices(
      JSON.stringify([
        { id: 'air-office', secret: SECRET, revokedBefore: ts + 1 },
      ])
    );
    expect(verify({ devices: revoked })).toBeNull();
    const fine = parseDisplayDevices(
      JSON.stringify([{ id: 'air-office', secret: SECRET, revokedBefore: ts }])
    );
    expect(verify({ devices: fine })).not.toBeNull();
  });
  it('rotating the device secret does not kill live sessions; rotating the session key does', () => {
    const rotated = parseDisplayDevices(
      JSON.stringify([{ id: 'air-office', secret: OLD }])
    );
    expect(verify({ devices: rotated })).not.toBeNull();
    expect(verify({ key: 'n'.repeat(40) })).toBeNull();
  });
});

describe('readCookie', () => {
  it('reads one cookie by name', () => {
    expect(readCookie('a=1; ovie_display=x.y; b=2', 'ovie_display')).toBe(
      'x.y'
    );
    expect(readCookie('a=1', 'ovie_display')).toBeNull();
    expect(readCookie(null, 'ovie_display')).toBeNull();
  });
});
