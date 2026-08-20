import { describe, expect, it } from 'vitest';
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
    expect(turn.instructions.toLowerCase()).not.toMatch(/you are ovie/);
    expect(() => turn.require('ingest-ack')).not.toThrow();
    expect(() => turn.require('gbrain-read')).not.toThrow();
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
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
});
