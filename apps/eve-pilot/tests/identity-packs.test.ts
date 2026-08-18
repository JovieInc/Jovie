import { describe, expect, it } from 'vitest';
import {
  bindEvePilotIdentity,
  EvePilotCapabilityDeniedError,
} from '../agent/select-identity';

describe('eve identity instruction packs', () => {
  it('denies Jovie privileged gbrain write and Symphony heal at the Eve entry', () => {
    const turn = bindEvePilotIdentity('jovie');
    expect(turn.instructions.includes('artist-facing')).toBe(true);
    expect(turn.instructions.includes('privileged gbrain write')).toBe(false);
    expect(turn.instructions.includes('Symphony heal')).toBe(false);
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => turn.require('symphony-heal')).toThrow(
      EvePilotCapabilityDeniedError
    );
  });

  it('lets Ovie ingest/ack and read gbrain at the Eve entry', () => {
    const turn = bindEvePilotIdentity('ovie');
    expect(turn.instructions.includes('ingest and ack')).toBe(true);
    expect(turn.instructions.includes('gbrain')).toBe(true);
    expect(turn.instructions.includes('read')).toBe(true);
    expect(() => turn.require('ingest-ack')).not.toThrow();
    expect(() => turn.require('gbrain-read')).not.toThrow();
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EvePilotCapabilityDeniedError
    );
    expect(() => turn.require('symphony-heal')).toThrow(
      EvePilotCapabilityDeniedError
    );
  });
});
