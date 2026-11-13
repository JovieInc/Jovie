import { createHash, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_RESOLUTION_SCHEMA } from '../capability-request.mjs';
import {
  capabilityAuthorities,
  nativeCapabilityTransition,
} from '../native-capability-adapter.mjs';
import {
  job,
  keys,
  now,
  request,
  resumed,
  store,
} from './fixtures/capability-request.mjs';

describe('native capability adapter', () => {
  it('does not treat a commissioning key as an access-decision authority', () => {
    const publicKey = keys.fixture.publicKey.export({
      type: 'spki',
      format: 'pem',
    });
    const fingerprint = createHash('sha256')
      .update(
        createPublicKey(publicKey).export({ type: 'spki', format: 'der' })
      )
      .digest('hex');
    const registry = { trustedAttestationKeyFingerprints: [fingerprint] };
    expect(capabilityAuthorities(registry, publicKey)).toEqual({});
    expect(
      capabilityAuthorities(
        {
          ...registry,
          capabilityResolutionAuthorities: [
            {
              keyId: fingerprint,
              actor: 'access-owner',
              owner: job.owner,
              schemas: [CAPABILITY_RESOLUTION_SCHEMA],
            },
          ],
        },
        publicKey
      )[fingerprint].schemas
    ).toEqual([CAPABILITY_RESOLUTION_SCHEMA]);
    expect(capabilityAuthorities(registry, 'invalid-public-key')).toEqual({});
  });

  it('uses the retained record for signed resume once without resetting artifacts or custody', async () => {
    const req = request();
    const { record } = store(req);
    const input = {
      op: 'checkpoint',
      record,
      job,
      nowMs: now + 2000,
      ...resumed(req),
    };
    const untrusted = await nativeCapabilityTransition(
      structuredClone(input),
      {}
    );
    expect(untrusted.result.allowed).toBe(false);
    const first = await nativeCapabilityTransition(input, keys);
    expect(first.result.allowed).toBe(true);
    expect(first.record.artifacts).toEqual(['artifact://repair/sha256']);
    expect(first.record.custody.lease).toBe('accepted-lease');
    const second = await nativeCapabilityTransition(
      { ...input, record: first.record },
      keys
    );
    expect(second.result).toMatchObject({
      allowed: false,
      reason: 'resume-already-reserved',
    });
  });
});
