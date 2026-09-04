import { describe, expect, it } from 'vitest';
import eveAgent from '../agent/agent';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  type EvePilotBoundTurn,
  EvePilotCapabilityDeniedError,
  eveIdentityForChannel,
  eveIdentityForRuntime,
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
  it('pins the Summer Photon speaker model on Eve Gateway OIDC', () => {
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
      assertEvePilotFactoryLock(armFactoryWrite(bindEvePilotIdentity('ovie')))
    ).toThrow(EvePilotCapabilityDeniedError);
  });

  it('lets Eve ingest/ack and read gbrain at the Ovie door entry', () => {
    const turn = bindEvePilotIdentity('ovie');
    expect(turn.instructions.includes('ingest and ack')).toBe(true);
    expect(turn.instructions).toMatch(
      /Engineering enters\s+Summer Linear intake/
    );
    expect(turn.instructions).toContain(
      'stored and queued for Summer Linear intake'
    );
    expect(turn.instructions).not.toContain(
      "including engineering, enter Summer's Kanban"
    );
    expect(turn.instructions.toLowerCase()).not.toMatch(/you are ovie/);
    expect(() => turn.require('ingest-ack')).not.toThrow();
    expect(() => turn.require('gbrain-read')).not.toThrow();
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

  it('grants Summer only the bounded Symphony repair outbox capability', () => {
    const turn = eveIdentityForChannel('ovie-summer-bottleneck');
    expect(turn.pack).toMatchObject({
      id: 'summer',
      canDispatchBoundedSymphonyRepair: true,
      canHealSymphony: false,
      canPrivilegedWriteGbrain: false,
    });
    expect(() => turn.require('symphony-bounded-dispatch')).not.toThrow();
    expect(() => turn.require('symphony-heal')).toThrow(
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

  it('binds Telegram to Ovie even when the runtime default is Jovie', () => {
    const previous = process.env.EVE_IDENTITY;
    delete process.env.EVE_IDENTITY;
    const turn = eveIdentityForChannel('telegram');
    expect(turn.pack.id).toBe('ovie');
    expect(() => turn.require('ingest-ack')).not.toThrow();
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
    if (previous === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previous;
    }
  });

  it('refuses a Summer runtime default outside the explicit shadow route', () => {
    const previous = process.env.EVE_IDENTITY;
    process.env.EVE_IDENTITY = 'summer';
    expect(eveIdentityForRuntime().pack.id).toBe('jovie');
    expect(eveIdentityForChannel('jovie-core-chat').pack.id).toBe('jovie');
    expect(eveIdentityForChannel('unknown-source').pack.id).toBe('jovie');
    expect(eveIdentityForChannel('ovie-summer-shadow').pack.id).toBe('summer');
    expect(eveIdentityForChannel('ovie-summer-bottleneck').pack.id).toBe(
      'summer'
    );
    expect(eveIdentityForChannel('photon').pack.id).toBe('summer');
    expect(eveIdentityForChannel('imessage').pack.id).toBe('summer');
    if (previous === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previous;
    }
  });
});
