import { describe, expect, it } from 'vitest';
import { prepareOvieChatTurn } from '@/lib/ovie/chat-entry';
import {
  assertEveChatFactoryLock,
  bindEveIdentityForChatMode,
  bindEveIdentityForTurn,
  type EveBoundTurn,
  EveCapabilityDeniedError,
} from '@/lib/ovie/identity';

function armFactoryWrite(turn: EveBoundTurn): EveBoundTurn {
  return {
    ...turn,
    pack: {
      ...turn.pack,
      canPrivilegedWriteGbrain: true,
      canHealSymphony: true,
    },
  };
}

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
    expect(() => assertEveChatFactoryLock(turn)).not.toThrow();
  });

  it('fails a runtime that still writes gbrain or heals Symphony', () => {
    const armed = armFactoryWrite(bindEveIdentityForTurn('jovie'));
    expect(() => assertEveChatFactoryLock(armed)).toThrow(
      EveCapabilityDeniedError
    );
    expect(() =>
      assertEveChatFactoryLock(armFactoryWrite(bindEveIdentityForTurn('ovie')))
    ).toThrow(EveCapabilityDeniedError);
  });

  it('lets Ovie ingest/ack and read gbrain on the chat entry', () => {
    const { eveTurn } = prepareOvieChatTurn('ov', 'post this tweet');
    expect(eveTurn.pack.id).toBe('ovie');
    expect(() => eveTurn.require('ingest-ack')).not.toThrow();
    expect(() => eveTurn.require('gbrain-read')).not.toThrow();
    expect(() => eveTurn.require('privileged-gbrain-write')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => eveTurn.require('symphony-heal')).toThrow(
      EveCapabilityDeniedError
    );
  });

  it('binds ov chat mode through the same entry as the chat route', () => {
    expect(bindEveIdentityForChatMode('ov').pack.id).toBe('ovie');
    expect(bindEveIdentityForChatMode(null).pack.id).toBe('jovie');
    expect(prepareOvieChatTurn('ov', null).eveTurn.pack.id).toBe('ovie');
    expect(prepareOvieChatTurn(null, null).eveTurn.pack.id).toBe('jovie');
  });
});
