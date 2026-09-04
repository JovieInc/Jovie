import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import eveAgent from '../agent/agent';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  type EvePilotBoundTurn,
  EvePilotCapabilityDeniedError,
  eveIdentityForChannel,
  eveIdentityForRuntime,
  eveIdentityIdForChannel,
} from '../agent/select-identity';

function armFactoryWrite(turn: EvePilotBoundTurn): EvePilotBoundTurn {
  return {
    ...turn,
    pack: {
      ...turn.pack,
      canPrivilegedWriteGbrain: true,
      canHealSymphony: true,
    },
  };
}

describe('eve identity instruction packs', () => {
  it('pins the Eve Gateway OIDC speaker model without a Summer root label', () => {
    expect(eveAgent).toEqual({ model: 'zai/glm-5.3-flash' });
  });

  it('denies Jovie privileged gbrain write and Symphony heal at the Eve entry', () => {
    const turn = bindEvePilotIdentity('jovie');
    expect(turn.instructions.includes('artist-facing')).toBe(true);
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => turn.require('symphony-heal')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
  });

  it('fails a runtime that still writes gbrain or heals Symphony', () => {
    expect(() =>
      assertEvePilotFactoryLock(armFactoryWrite(bindEvePilotIdentity('jovie')))
    ).toThrow(EvePilotCapabilityDeniedError);
    expect(() =>
      assertEvePilotFactoryLock(armFactoryWrite(bindEvePilotIdentity('summer')))
    ).toThrow(EvePilotCapabilityDeniedError);
  });

  it('binds private presentation to Summer without an Ovie identity', () => {
    const turn = bindEvePilotIdentity('summer');
    expect(turn.instructions).toContain('You are Summer Jovi — AI Agent');
    expect(turn.instructions).toContain(
      'presentation name is never a routing key or recipient selector'
    );
    expect(turn.instructions).toContain(
      'Photon and all external-recipient messaging are disabled'
    );
    expect(turn.instructions).toContain('Do not speak as Ovie or Jovie');
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
  });

  it('binds a read-only Summer shadow only through the explicit Ovie route', () => {
    const turn = eveIdentityForChannel('ovie-summer-shadow');
    expect(turn.pack).toMatchObject({
      id: 'summer',
      role: 'company-operator',
      canIngestAck: false,
      canReadGbrain: false,
    });
    expect(turn.instructions).toContain('Read-only');
    expect(() => turn.require('ingest-ack')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => turn.require('gbrain-read')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
  });

  it('binds the runtime pack at Eve load (default Jovie)', () => {
    const previous = process.env.EVE_IDENTITY;
    delete process.env.EVE_IDENTITY;
    const turn = eveIdentityForRuntime();
    expect(turn.pack.id).toBe('jovie');
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
    if (previous === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previous;
    }
  });

  it('binds Telegram presentation to Summer even when runtime defaults to Jovie', () => {
    const previous = process.env.EVE_IDENTITY;
    delete process.env.EVE_IDENTITY;
    const turn = eveIdentityForChannel('telegram');
    expect(turn.pack.id).toBe('summer');
    expect(() => turn.require('ingest-ack')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
    if (previous === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previous;
    }
  });

  it('binds one explicit deployment identity and never falls back across lanes', () => {
    const previous = process.env.EVE_IDENTITY;
    process.env.EVE_IDENTITY = 'summer';
    expect(eveIdentityForRuntime().pack.id).toBe('summer');
    expect(eveIdentityForChannel('jovie-core-chat').pack.id).toBe('summer');
    expect(eveIdentityForChannel('unknown-source').pack.id).toBe('summer');
    expect(eveIdentityForChannel('ovie-summer-shadow').pack.id).toBe('summer');
    expect(eveIdentityIdForChannel('photon')).toBe('summer');
    expect(eveIdentityIdForChannel('imessage')).toBe('summer');
    expect(eveIdentityForChannel('photon').pack.id).toBe('summer');
    const photon = readFileSync(
      resolve(import.meta.dirname, '../agent/channels/photon.ts'),
      'utf8'
    );
    expect(photon).toContain('bindEvePilotIdentity(identity)');
    const livePhoton = photon
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .toLowerCase();
    expect(livePhoton).not.toMatch(/hermes|trigger\.dev|local-executor/);
    if (previous === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previous;
    }
  });
});
