import { describe, expect, it } from 'vitest';
import {
  onPhotonIMessage,
  photonThreadBinding,
  photonUserName,
} from '../agent/channels/photon';

const env = {
  IMESSAGE_PROJECT_ID: 'existing-project',
  IMESSAGE_PROJECT_SECRET: 'existing-secret',
  IMESSAGE_WEBHOOK_SECRET: 'existing-webhook-secret',
};
const ctx = (id = 'thread-1') => ({ thread: { id } }) as never;
const msg = (userId: string, phone?: string, isBot = false) => ({
  author: { isBot, phone, userId, userName: 'Test user' },
});

describe('Photon lane contract', () => {
  it('binds public Jovie with redacted signed provenance', () => {
    const result = onPhotonIMessage(ctx(), msg('artist-1'), {
      ...env,
      EVE_IDENTITY: 'jovie',
    });
    expect(result?.auth).toMatchObject({
      principalId: 'photon:artist-1',
      principalType: 'user',
      attributes: {
        audience: 'public-artist',
        identity: 'jovie',
        presentation: 'jovie',
        provenance: 'photon-hmac',
        thread_binding: photonThreadBinding('jovie', 'thread-1'),
      },
    });
    const binding = result?.auth?.attributes?.project_binding;
    expect(binding).toMatch(/^[a-f0-9]{16}$/);
    expect(binding).not.toContain(env.IMESSAGE_PROJECT_ID);
    expect(result?.context?.[0]).toContain('Jovie Eve');
  });

  it('binds allowlisted private Summer through Ovie presentation', () => {
    const result = onPhotonIMessage(
      ctx('private-thread'),
      msg('private-user', '+15555550123'),
      {
        ...env,
        EVE_IDENTITY: 'summer',
        OVIE_IMESSAGE_ALLOWED_SENDERS: '+15555550123',
      }
    );
    expect(result?.auth?.attributes).toMatchObject({
      audience: 'private-company',
      identity: 'summer',
      presentation: 'ovie',
      provenance: 'photon-hmac',
      thread_binding: photonThreadBinding('summer', 'private-thread'),
    });
    expect(result?.title).toBe('Summer via Ovie');
    expect(result?.context?.[0]).toContain('You are Summer');
  });

  it.each([
    ['invalid lane', msg('artist'), { ...env, EVE_IDENTITY: 'ovie' }],
    ['missing credentials', msg('artist'), { EVE_IDENTITY: 'jovie' }],
    ['bot', msg('service', undefined, true), { ...env, EVE_IDENTITY: 'jovie' }],
    [
      'missing user',
      msg('', '+15555550123'),
      {
        ...env,
        EVE_IDENTITY: 'summer',
        OVIE_IMESSAGE_ALLOWED_SENDERS: '+15555550123',
      },
    ],
    [
      'cross-lane sender',
      msg('public', '+15555550999'),
      {
        ...env,
        EVE_IDENTITY: 'summer',
        OVIE_IMESSAGE_ALLOWED_SENDERS: '+15555550123',
      },
    ],
  ] as const)('fails closed for %s', (_case, message, environment) => {
    expect(onPhotonIMessage(ctx(), message, environment)).toBeNull();
  });

  it('keeps invalid deployments neutral and thread bindings stable but isolated', () => {
    expect(photonUserName({})).toBe('Eve (unconfigured)');
    expect(photonUserName({ EVE_IDENTITY: 'ovie' })).toBe('Eve (unconfigured)');
    expect(photonUserName({ EVE_IDENTITY: 'jovie' })).toBe('Jovie');
    expect(photonUserName({ EVE_IDENTITY: 'summer' })).toBe('Summer');
    const binding = photonThreadBinding('summer', 'same-thread');
    expect(photonThreadBinding('summer', 'same-thread')).toBe(binding);
    expect(photonThreadBinding('jovie', 'same-thread')).not.toBe(binding);
    expect(photonThreadBinding('summer', 'other-thread')).not.toBe(binding);
    expect(binding).not.toContain('same-thread');
  });
});
