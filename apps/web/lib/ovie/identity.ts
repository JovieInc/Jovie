/**
 * Eve identity pack selection (JOV-5216).
 *
 * Identity is an explicit pack, not a chatMode prompt flag. executeChatTurn
 * remains the generation fallback.
 */

export type EveIdentityId = 'jovie' | 'ovie';

export type EveIdentityPack = {
  readonly id: EveIdentityId;
  readonly role: 'artist' | 'founder';
  readonly canPrivilegedWriteGbrain: boolean;
  readonly canHealSymphony: boolean;
  readonly canIngestAck: boolean;
  readonly canReadGbrain: boolean;
  readonly allowsLybHealthMemory: boolean;
};

const JOVIE_PACK: EveIdentityPack = {
  id: 'jovie',
  role: 'artist',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: false,
  canReadGbrain: false,
  allowsLybHealthMemory: false,
};

const OVIE_PACK: EveIdentityPack = {
  id: 'ovie',
  role: 'founder',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: true,
  canReadGbrain: true,
  allowsLybHealthMemory: false,
};

export function selectEveIdentity(id: EveIdentityId): EveIdentityPack {
  return id === 'ovie' ? OVIE_PACK : JOVIE_PACK;
}

/** Map the existing OV chat surface onto the Ovie pack. */
export function eveIdentityForChatMode(
  chatMode: 'ov' | null | undefined
): EveIdentityPack {
  return selectEveIdentity(chatMode === 'ov' ? 'ovie' : 'jovie');
}
