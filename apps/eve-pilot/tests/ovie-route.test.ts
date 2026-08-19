import { describe, expect, it } from 'vitest';
import {
  admitOvieIMessage,
  parseOvieIMessageAllowedSenders,
} from '../agent/lib/imessage-allowlist';
import { routeOvieTalk } from '../agent/lib/ovie-route';
import { eveIdentityForChannel } from '../agent/select-identity';

describe('Ovie talk split', () => {
  it('drives Jovie for Tim creator work and dogfood', () => {
    expect(routeOvieTalk('post my own song tonight')).toEqual({
      kind: 'drive-jovie',
      reason: 'creator-work',
    });
    expect(routeOvieTalk('dogfood this through jovie')).toEqual({
      kind: 'drive-jovie',
      reason: 'dogfood',
    });
  });

  it('admits a build when Jovie cannot carry the request', () => {
    expect(routeOvieTalk("jovie can't set this thumbnail")).toEqual({
      kind: 'admit-build',
      missing: 'jovie-capability',
    });
    expect(routeOvieTalk('need an extension for this connector')).toEqual({
      kind: 'admit-build',
      missing: 'extension',
    });
  });

  it('otherwise ingests and acks', () => {
    expect(routeOvieTalk('remind me to text mom')).toEqual({
      kind: 'ingest-ack',
    });
  });
});

describe('Ovie iMessage allowlist', () => {
  it('fails closed and admits only an allowlisted sender', () => {
    expect(parseOvieIMessageAllowedSenders('')).toEqual(new Set());
    const allowed = parseOvieIMessageAllowedSenders('+1 (732) 668-2148');
    expect(allowed.has('+17326682148')).toBe(true);
    expect(
      admitOvieIMessage({ phone: '+17326682148', isBot: false }, allowed)
    ).toBe(true);
    expect(
      admitOvieIMessage({ phone: '+15555550100', isBot: false }, allowed)
    ).toBe(false);
    expect(
      admitOvieIMessage({ phone: '+17326682148', isBot: true }, allowed)
    ).toBe(false);
    expect(admitOvieIMessage(undefined, allowed)).toBe(false);
  });

  it('binds iMessage and Photon to Ovie', () => {
    const previous = process.env.EVE_IDENTITY;
    delete process.env.EVE_IDENTITY;
    expect(eveIdentityForChannel('imessage').pack.id).toBe('ovie');
    expect(eveIdentityForChannel('photon').pack.id).toBe('ovie');
    if (previous === undefined) delete process.env.EVE_IDENTITY;
    else process.env.EVE_IDENTITY = previous;
  });
});
