import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalOutageValue,
  outageIncidentId,
  signSymphonyOutageHealth,
  verifyOutageHealthProjection,
} from '../../../packages/agent-transport-contracts/index.ts';

const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();
const trusted = new Map([
  [
    'producer',
    keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  ],
]);
const health = {
  schema: 'jovie-symphony-health-transition/v1',
  eventId: 'health-event-001',
  service: 'jovie-symphony',
  port: 4041,
  repository: 'JovieInc/Jovie',
  sourceSha: 'a'.repeat(40),
  lastHealthyAt: '2026-09-06T00:00:00Z',
  lostAt: '2026-09-06T00:01:00Z',
  observedAt: '2026-09-06T00:02:00Z',
  state: 'lost',
  confirmed: true,
  operatorHold: false,
  origin: 'service-health-observer',
};
describe('shared signed Symphony health contract', () => {
  it('round trips the exact producer projection and rejects tampering or an unknown signer', () => {
    const signed = signSymphonyOutageHealth(health, 'producer', privateKey);
    expect(verifyOutageHealthProjection(signed, trusted)).toEqual(signed);
    for (const patch of [
      { sourceSha: 'b'.repeat(40) },
      { operatorHold: true },
      { state: 'healthy' },
      { eventId: 'health-event-002' },
    ])
      expect(() =>
        verifyOutageHealthProjection({ ...signed, ...patch }, trusted)
      ).toThrow();
    expect(() => verifyOutageHealthProjection(signed, new Map())).toThrow(
      'untrusted'
    );
  });
  it('strictly rejects wrong service scope, capacity-only reports and extra fields', () => {
    for (const patch of [
      { port: 4042 },
      { repository: 'LogYourBody/LogYourBody' },
      { confirmed: false },
      { capacity: 0 },
      { sourceSha: 'main' },
      { lostAt: 'invalid' },
      { origin: 'capacity-observer' },
    ])
      expect(() =>
        signSymphonyOutageHealth(
          { ...health, ...patch },
          'producer',
          privateKey
        )
      ).toThrow();
    const signed = signSymphonyOutageHealth(health, 'producer', privateKey);
    expect(() =>
      verifyOutageHealthProjection(
        { ...signed, attestation: { ...signed.attestation, extra: true } },
        trusted
      )
    ).toThrow();
  });
  it('keeps incident identity stable across observations but distinct across transitions', () => {
    expect(
      outageIncidentId({
        ...health,
        eventId: 'next-event',
        observedAt: '2026-09-06T00:03:00Z',
      })
    ).toBe(outageIncidentId(health));
    expect(
      outageIncidentId({ ...health, lostAt: '2026-09-06T00:03:00Z' })
    ).not.toBe(outageIncidentId(health));
    expect(canonicalOutageValue({ z: [null, 2], a: true })).toBe(
      '{"a":true,"z":[null,2]}'
    );
  });
  it('rejects invalid signer identities and non-Ed25519 keys', () => {
    expect(() =>
      signSymphonyOutageHealth(health, 'bad key', privateKey)
    ).toThrow('key ID');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString();
    expect(() => signSymphonyOutageHealth(health, 'producer', rsa)).toThrow(
      'Ed25519'
    );
  });
});
