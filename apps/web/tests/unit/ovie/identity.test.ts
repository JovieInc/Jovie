import { describe, expect, it } from 'vitest';
import {
  assertEveChatFactoryLock,
  bindEveIdentityForChatMode,
  bindEveIdentityForTurn,
  EveCapabilityDeniedError,
} from '@/lib/ovie/identity';

describe('Eve identity packs (JOV-5216)', () => {
  it('denies Jovie privileged gbrain write and Symphony heal on the bound turn', () => {
    const turn = bindEveIdentityForTurn('jovie');
    expect(turn.pack.role).toBe('artist');
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => turn.require('symphony-heal')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => turn.require('gbrain-read')).toThrow(EveCapabilityDeniedError);
    expect(() => turn.require('ingest-ack')).toThrow(EveCapabilityDeniedError);
    expect(() => assertEveChatFactoryLock(turn)).not.toThrow();
    expect(turn.instructions.includes('privileged gbrain write')).toBe(false);
    expect(turn.instructions.includes('Symphony heal')).toBe(false);
  });

  it('lets Ovie ingest/ack and read gbrain, still denies factory writes', () => {
    const turn = bindEveIdentityForTurn('ovie');
    expect(turn.pack.role).toBe('founder');
    expect(() => turn.require('ingest-ack')).not.toThrow();
    expect(() => turn.require('gbrain-read')).not.toThrow();
    expect(() => turn.require('privileged-gbrain-write')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => turn.require('symphony-heal')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => assertEveChatFactoryLock(turn)).not.toThrow();
    expect(turn.instructions.includes('ingest and ack')).toBe(true);
    expect(turn.instructions.includes('gbrain')).toBe(true);
  });

  it('binds ov chat mode through the same entry as the chat route', () => {
    const ovie = bindEveIdentityForChatMode('ov');
    const jovie = bindEveIdentityForChatMode(null);
    expect(ovie.pack.id).toBe('ovie');
    expect(jovie.pack.id).toBe('jovie');
    expect(() => ovie.require('ingest-ack')).not.toThrow();
    expect(() => jovie.require('ingest-ack')).toThrow(EveCapabilityDeniedError);
    expect(() => assertEveChatFactoryLock(ovie)).not.toThrow();
    expect(() => assertEveChatFactoryLock(jovie)).not.toThrow();
  });
});
