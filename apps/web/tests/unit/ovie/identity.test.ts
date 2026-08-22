import { describe, expect, it } from 'vitest';
import { prepareOvieChatTurn } from '@/lib/ovie/chat-entry';
import {
  applyEveIdentityToSystemPrompt,
  assertEveChatFactoryLock,
  bindEveIdentityForChatMode,
  bindEveIdentityForTurn,
  type EveBoundTurn,
  EveCapabilityDeniedError,
} from '@/lib/ovie/identity';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';

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

  it('lets Ovie ingest/ack and read gbrain on the chat entry', async () => {
    const { eveTurn } = await prepareOvieChatTurn('ov', 'post this tweet', {
      store: new MemoryOperatingStore(),
    });
    expect(eveTurn.pack.id).toBe('ovie');
    expect(eveTurn.pack.surface).toBe('door');
    expect(eveTurn.pack.isPersona).toBe(false);
    expect(eveTurn.pack.conversationalAuthority).toBe('summer');
    expect(() => eveTurn.require('ingest-ack')).not.toThrow();
    expect(() => eveTurn.require('gbrain-read')).not.toThrow();
    expect(() => eveTurn.require('privileged-gbrain-write')).toThrow(
      EveCapabilityDeniedError
    );
    expect(() => eveTurn.require('symphony-heal')).toThrow(
      EveCapabilityDeniedError
    );
  });

  it('binds ov chat mode through the same entry as the chat route', async () => {
    expect(bindEveIdentityForChatMode('ov').pack.id).toBe('ovie');
    expect(bindEveIdentityForChatMode(null).pack.id).toBe('jovie');
    expect(
      (
        await prepareOvieChatTurn('ov', null, {
          store: new MemoryOperatingStore(),
        })
      ).eveTurn.pack.id
    ).toBe('ovie');
    expect(
      (
        await prepareOvieChatTurn(null, null, {
          store: new MemoryOperatingStore(),
        })
      ).eveTurn.pack.id
    ).toBe('jovie');
  });

  it('prepends Eve-on-door instructions and does not leave Jovie copy in charge of the door', () => {
    const prompt = applyEveIdentityToSystemPrompt(
      'You are Jovie, an AI music career assistant.',
      {
        id: 'ovie',
        instructions:
          'Eve on the Ovie door. Ingest and ack. Do not self-identify as Ovie.',
      }
    );
    expect(prompt.startsWith('Eve on the Ovie door.')).toBe(true);
    expect(prompt.toLowerCase()).not.toMatch(/i am ovie|you are ovie/);
    expect(prompt).toContain('Do not identify as Jovie.');
    expect(
      applyEveIdentityToSystemPrompt('You are Jovie.', {
        id: 'jovie',
        instructions: 'You are Jovie, the artist-facing product agent.',
      })
    ).toBe('You are Jovie.');
    const fallback = applyEveIdentityToSystemPrompt('You are Jovie.', {
      id: 'ovie',
      instructions: '',
    });
    expect(fallback.toLowerCase()).not.toMatch(/you are ovie/);
    expect(fallback).toMatch(/ingest and ack/i);
  });
});
